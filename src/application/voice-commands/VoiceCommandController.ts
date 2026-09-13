import { DomainError } from '../../shared/errors/DomainError';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { CommandInterpreter } from './CommandInterpreter';
import type { CommandRegistry, CommandResult, CommandTarget } from './CommandRegistry';
import { CommandClarification } from './CommandClarification';
import { requiresConfirmation, type VoiceCommand } from './CommandSchema';
import { validateCommand } from './CommandValidator';

export type VoiceCommandState =
  | { readonly status: 'idle' }
  | { readonly status: 'interpreting'; readonly text: string }
  | {
      readonly status: 'clarification';
      readonly text: string;
      readonly context: CommandClarification;
    }
  | {
      readonly status: 'selection';
      readonly text: string;
      readonly revision: number;
      readonly command: VoiceCommand;
      readonly targets: readonly CommandTarget[];
    }
  | {
      readonly status: 'preview';
      readonly text: string;
      readonly revision: number;
      readonly command: VoiceCommand;
      readonly target?: CommandTarget;
    }
  | { readonly status: 'executing'; readonly text: string; readonly command: VoiceCommand }
  | { readonly status: 'success'; readonly text: string; readonly result: CommandResult }
  | {
      readonly status: 'error';
      readonly text: string;
      readonly code: string;
      readonly message: string;
    };

/** Owns transient intent only. A confirmation is tied to one immutable revision, consumed once. */
export class VoiceCommandController {
  #state: VoiceCommandState = Object.freeze({ status: 'idle' });
  #revision = 0;
  readonly #listeners = new Set<() => void>();

  public constructor(
    private readonly interpreter: CommandInterpreter,
    private readonly registry: CommandRegistry,
    private readonly currentDate: CurrentDateProvider,
  ) {}

  public getSnapshot = (): VoiceCommandState => this.#state;
  public subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  public cancel(): void {
    // Once persistence starts, cancellation cannot promise rollback.
    if (this.#state.status === 'executing') return;
    this.#revision++;
    this.setState({ status: 'idle' });
  }

  public async submit(text: string): Promise<void> {
    await this.process(text);
  }

  public async answer(answer: string): Promise<void> {
    const state = this.#state;
    if (state.status !== 'clarification' || !this.interpreter.clarify) return;
    await this.process(state.text, state.context, answer);
  }

  private async process(
    text: string,
    context?: CommandClarification,
    answer?: string,
  ): Promise<void> {
    if (this.#state.status === 'executing') return;
    const revision = ++this.#revision;
    this.setState({ status: 'interpreting', text });
    try {
      if (!text.trim() || text.length > 4000)
        throw new DomainError(
          'voice_command.invalid',
          'Введите одну команду длиной до 4000 символов.',
        );
      const interpreted =
        context && this.interpreter.clarify
          ? await this.interpreter.clarify(context, answer ?? '', this.currentDate.getCurrentDate())
          : await this.interpreter.interpret(text, this.currentDate.getCurrentDate());
      if (revision !== this.#revision) return;
      const result = validateCommand(interpreted);
      if (!result.ok) throw result.error;
      this.registry.validate(result.value);
      if (!this.registry.supports(result.value))
        throw new DomainError(
          'voice_command.unavailable',
          'Эта команда пока недоступна. Текст можно исправить.',
        );
      if (requiresConfirmation(result.value)) {
        const targets = await this.registry.resolve(result.value);
        if (revision !== this.#revision) return;
        if (targets && targets.length === 0) {
          const command = result.value;
          if (command.type === 'reschedule_task' || command.type === 'complete_task')
            throw new CommandClarification(
              {
                type: command.type,
                title: command.payload.query,
                ...(command.type === 'reschedule_task'
                  ? { date: command.payload.date, reason: command.payload.reason }
                  : { actualResult: command.payload.actualResult }),
              },
              'title',
              'Подходящие задачи не найдены. Как называется нужная задача?',
            );
          throw new DomainError('voice_command.target_not_found', 'Подходящие задачи не найдены.');
        }
        if (targets && targets.length > 1)
          this.setState({ status: 'selection', revision, text, command: result.value, targets });
        else
          this.setState({
            status: 'preview',
            revision,
            text,
            command: result.value,
            ...(targets?.[0] ? { target: targets[0] } : {}),
          });
      } else {
        await this.execute(result.value, text);
      }
    } catch (error: unknown) {
      if (revision !== this.#revision) return;
      if (error instanceof CommandClarification) {
        this.setState({ status: 'clarification', text, context: error });
        return;
      }
      if (context) {
        this.setState({
          status: 'clarification',
          text,
          context: new CommandClarification(
            context.draft,
            context.field,
            error instanceof DomainError ? error.message : context.message,
          ),
        });
        return;
      }
      this.setError(
        text,
        error,
        'voice_command.interpretation_failed',
        'Не удалось разобрать команду. Уточните текст.',
      );
    }
  }

  public async confirm(revision: number): Promise<void> {
    const state = this.#state;
    if (state.status !== 'preview' || state.revision !== revision) return;
    await this.execute(state.command, state.text, state.target);
  }

  public selectTarget(revision: number, id: string): void {
    const state = this.#state;
    if (state.status !== 'selection' || state.revision !== revision) return;
    const target = state.targets.find((item) => item.id === id);
    if (!target) return;
    this.setState({
      status: 'preview',
      text: state.text,
      revision: ++this.#revision,
      command: state.command,
      target,
    });
  }

  private async execute(
    command: VoiceCommand,
    text: string,
    target?: CommandTarget,
  ): Promise<void> {
    this.setState({ status: 'executing', text, command });
    try {
      const result = await this.registry.execute(command, target);
      this.setState({ status: 'success', text, result: Object.freeze({ ...result }) });
    } catch (error: unknown) {
      this.setError(
        text,
        error,
        'voice_command.execution_unknown',
        'Не удалось подтвердить результат. Проверьте данные приложения перед повтором команды.',
      );
    }
  }

  private setError(text: string, error: unknown, code: string, message: string): void {
    this.setState({
      status: 'error',
      text,
      code: error instanceof DomainError ? error.code : code,
      message: error instanceof DomainError ? error.message : message,
    });
  }

  private setState(state: VoiceCommandState): void {
    this.#state = Object.freeze(state);
    for (const listener of this.#listeners) listener();
  }
}
