import type { PlannerLibraryReadModel } from '../../application/planner/PlannerLibraryReadModel';
import type { CompletionRefreshTask } from './PlannerActionCompletion';

export type PlanningRefreshOutcome =
  | { readonly status: 'ready' }
  | { readonly status: 'failed'; readonly error: Error }
  | { readonly status: 'superseded' };

export function queuePlannerRefresh(refresh: () => Promise<void>): () => void {
  let active = true;
  void Promise.resolve().then(() => {
    if (active) return refresh();
  });
  return () => {
    active = false;
  };
}

export class LatestPlannerRefresh {
  #generation = 0;
  #sequence = 0;
  #latest: Promise<PlanningRefreshOutcome> | null = null;
  public run<T>(
    read: () => Promise<T>,
    publish: (value: T) => void,
  ): Promise<PlanningRefreshOutcome> {
    const generation = this.#generation,
      sequence = ++this.#sequence;
    const stale = (): Promise<PlanningRefreshOutcome> | PlanningRefreshOutcome | null => {
      if (generation !== this.#generation) return { status: 'superseded' };
      if (sequence !== this.#sequence) return this.#latest;
      return null;
    };
    this.#latest = Promise.resolve()
      .then(read)
      .then(
        (value): PlanningRefreshOutcome | Promise<PlanningRefreshOutcome> => {
          const newer = stale();
          if (newer) return newer;
          publish(value);
          return { status: 'ready' };
        },
        (reason: unknown): PlanningRefreshOutcome | Promise<PlanningRefreshOutcome> => {
          const newer = stale();
          if (newer) return newer;
          return {
            status: 'failed',
            error:
              reason instanceof Error
                ? reason
                : new Error('Не удалось загрузить данные. Повторите попытку.'),
          };
        },
      );
    return this.#latest;
  }
  public reset(): void {
    this.#generation++;
    this.#latest = null;
  }
}
export async function settleCompletionLibrary(
  model: Pick<PlannerLibraryReadModel, 'refresh' | 'whenSettled' | 'getSnapshot'>,
  retry: boolean,
): Promise<void> {
  await (retry ? model.refresh() : model.whenSettled());
  const error = model.getSnapshot().error;
  if (error) throw error;
}
export function createCompletionLibraryTask(
  model: Pick<PlannerLibraryReadModel, 'refresh' | 'whenSettled' | 'getSnapshot'>,
): CompletionRefreshTask {
  let failed = false;
  return {
    key: 'library',
    async run() {
      try {
        await settleCompletionLibrary(model, failed);
        failed = false;
      } catch (error: unknown) {
        failed = true;
        throw error;
      }
    },
  };
}
export function requireRefreshOutcome(outcome: PlanningRefreshOutcome): void {
  if (outcome.status === 'failed') throw outcome.error;
  if (outcome.status === 'superseded') throw new Error('Обновление отменено при смене экрана.');
}
