import type { CompleteLifeAction } from '../../application';
import { EntityId, type LifeAction } from '../../domain';

export type CompletionTarget = { readonly actionId: string; readonly completionKey: string };
export type CompletionRefreshKey = 'workspace' | 'library' | 'planning';
export type CompletionRefreshTask = {
  readonly key: CompletionRefreshKey;
  readonly run: () => Promise<void>;
};
export type CompletionReceipt = CompletionTarget & { readonly action: LifeAction };
export type CompletionRefreshIssue = { readonly key: CompletionRefreshKey; readonly error: Error };
export type CompletionSnapshot =
  | { readonly phase: 'idle' }
  | { readonly phase: 'saving'; readonly target: CompletionTarget }
  | { readonly phase: 'not_saved'; readonly target: CompletionTarget; readonly error: Error }
  | {
      readonly phase: 'saved';
      readonly receipt: CompletionReceipt;
      readonly refresh: 'pending' | 'ready' | 'failed';
      readonly issues: readonly CompletionRefreshIssue[];
    };
export const idleCompletion: CompletionSnapshot = { phase: 'idle' };

export class PlannerActionCompletion {
  #snapshot: CompletionSnapshot = idleCompletion;
  readonly #listeners = new Set<() => void>();
  #inFlight: Promise<void> | null = null;
  #closed = false;
  public constructor(
    private readonly command: Pick<CompleteLifeAction, 'execute'>,
    private readonly tasks: readonly CompletionRefreshTask[],
  ) {}
  public readonly getSnapshot = (): CompletionSnapshot => this.#snapshot;
  public readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  public readonly complete = (target: CompletionTarget): Promise<void> => {
    if (this.#closed) return Promise.resolve();
    if (this.#inFlight) return this.#inFlight;
    if (
      this.#snapshot.phase === 'saved' &&
      this.#snapshot.receipt.completionKey === target.completionKey
    ) {
      return this.retryRefresh();
    }
    return this.run(async () => {
      this.update({ phase: 'saving', target });
      let action: LifeAction;
      try {
        const result = await this.command.execute({
          lifeActionId: EntityId.create(target.actionId),
          expectedCompletionKey: target.completionKey,
        });
        if (!result.ok) throw result.error;
        action = result.value;
      } catch (error: unknown) {
        this.update({ phase: 'not_saved', target, error: completionError(error) });
        return;
      }
      if (this.#closed) return;
      await this.refresh(
        { actionId: action.id.toString(), completionKey: action.completionKey, action },
        0,
      );
    });
  };
  public readonly retryRefresh = (): Promise<void> => {
    if (this.#closed) return Promise.resolve();
    if (this.#inFlight) return this.#inFlight;
    const snapshot = this.#snapshot;
    if (snapshot.phase !== 'saved' || snapshot.refresh !== 'failed') return Promise.resolve();
    const start = this.tasks.findIndex((task) =>
      snapshot.issues.some((issue) => issue.key === task.key),
    );
    return this.run(() => this.refresh(snapshot.receipt, Math.max(0, start)));
  };
  public close(): void {
    this.#closed = true;
    this.#listeners.clear();
  }
  public readonly dismissFeedback = (): void => {
    if (!this.#inFlight) this.update(idleCompletion);
  };
  private run(work: () => Promise<void>): Promise<void> {
    this.#inFlight = Promise.resolve()
      .then(() => {
        if (!this.#closed) return work();
      })
      .finally(() => {
        this.#inFlight = null;
      });
    return this.#inFlight;
  }
  private async refresh(receipt: CompletionReceipt, start: number): Promise<void> {
    this.update({ phase: 'saved', receipt, refresh: 'pending', issues: [] });
    const issues: CompletionRefreshIssue[] = [];
    for (const task of this.tasks.slice(start)) {
      if (this.#closed) return;
      try {
        await task.run();
      } catch (error: unknown) {
        issues.push({ key: task.key, error: completionError(error) });
      }
    }
    this.update({ phase: 'saved', receipt, refresh: issues.length ? 'failed' : 'ready', issues });
  }
  private update(snapshot: CompletionSnapshot): void {
    if (this.#closed) return;
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        /* Feedback cannot roll back a committed command. */
      }
    }
  }
}

function completionError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Не удалось выполнить операцию. Повторите попытку.');
}
