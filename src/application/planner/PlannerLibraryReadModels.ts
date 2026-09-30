import type { CommittedPlannerChanges } from '../ports/CommittedPlannerChanges';
import { PlannerLibraryReadModel, type PlannerLibraryReaders } from './PlannerLibraryReadModel';

/** Owns active sessions for cleanup, without retaining snapshots between screens. */
export class PlannerLibraryReadModels {
  readonly #active = new Set<PlannerLibraryReadModel>();
  #closed = false;

  public constructor(
    private readonly readers: PlannerLibraryReaders,
    private readonly changes: CommittedPlannerChanges,
  ) {}

  public create(today: string): PlannerLibraryReadModel {
    this.#assertOpen();
    return new PlannerLibraryReadModel(this.readers, this.changes, today, {
      activate: (model) => {
        this.#assertOpen();
        this.#active.add(model);
      },
      deactivate: (model) => {
        this.#active.delete(model);
      },
    });
  }

  public close(): void {
    this.#closed = true;
    for (const model of this.#active) model.dispose();
    this.#active.clear();
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('Модель чтения закрыта.');
  }
}
