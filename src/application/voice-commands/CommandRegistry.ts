import { DomainError } from '../../shared/errors/DomainError';
import type { VoiceCommand, VoiceCommandType } from './CommandSchema';

export interface CommandResult {
  readonly message: string;
  readonly items?: readonly { readonly title: string; readonly detail: string }[];
  readonly created?:
    | { readonly type: 'task'; readonly id: string; readonly date: string }
    | { readonly type: 'goal'; readonly id: string };
}
export interface CommandTarget {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly version: number;
}
export type CommandHandler = (
  command: VoiceCommand,
  target?: CommandTarget,
) => Promise<CommandResult>;
export type CommandHandlers = Partial<Readonly<Record<VoiceCommandType, CommandHandler>>>;

/** App composition supplies handlers that call existing application commands, never stores. */
export class CommandRegistry {
  readonly #handlers: CommandHandlers;

  public constructor(
    handlers: CommandHandlers,
    private readonly validateIntent: (command: VoiceCommand) => void = () => {},
    private readonly resolveTargets: (
      command: VoiceCommand,
    ) => Promise<readonly CommandTarget[] | null> = async () => null,
  ) {
    this.#handlers = Object.freeze({ ...handlers });
  }

  public validate(command: VoiceCommand): void {
    this.validateIntent(command);
  }

  public async resolve(command: VoiceCommand): Promise<readonly CommandTarget[] | null> {
    const targets = await this.resolveTargets(command);
    return targets === null
      ? null
      : Object.freeze(targets.map((target) => Object.freeze({ ...target })));
  }

  public supports(command: VoiceCommand): boolean {
    return (
      Object.hasOwn(this.#handlers, command.type) &&
      typeof this.#handlers[command.type] === 'function'
    );
  }

  public async execute(command: VoiceCommand, target?: CommandTarget): Promise<CommandResult> {
    this.validate(command);
    const handler = this.#handlers[command.type];
    if (!this.supports(command) || handler === undefined) {
      throw new DomainError(
        'voice_command.unavailable',
        'Эта команда пока недоступна. Текст можно исправить.',
      );
    }
    return handler(command, target);
  }
}
