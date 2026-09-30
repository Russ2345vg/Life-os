import { DayDate, type Direction, type Goal, type LifeAction, type Sphere } from '../../domain';
import type { FocusPeriod } from '../../domain/planner/FocusPeriod';
import type { InboxIdea } from '../../domain/planner/InboxIdea';
import type {
  CommittedPlannerChanges,
  PlannerDataCollection,
} from '../ports/CommittedPlannerChanges';
import type { SpheresSnapshot } from '../queries/GetSpheres';

export interface PlannerLibraryReaders {
  getGoals(): Promise<readonly Goal[]>;
  getDirections(): Promise<readonly Direction[]>;
  getSpheres(): Promise<SpheresSnapshot>;
  getActions(): Promise<readonly LifeAction[]>;
  getIdeas(): Promise<readonly InboxIdea[]>;
  getFocus(today: string): Promise<FocusPeriod | null>;
  getTimeCapacity(): Promise<readonly (number | null)[]>;
}

export interface PlannerLibraryData {
  readonly goals: readonly Goal[];
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
  readonly actions: readonly LifeAction[];
  readonly ideas: readonly InboxIdea[];
  readonly focus: FocusPeriod | null;
  readonly timeCapacity: readonly (number | null)[];
}

export type PlannerLibrarySlice = keyof PlannerLibraryData;
export interface PlannerLibrarySnapshot {
  readonly data: PlannerLibraryData | null;
  readonly refreshing: boolean;
  readonly error: Error | null;
}

const slices: readonly PlannerLibrarySlice[] = [
  'goals',
  'directions',
  'spheres',
  'actions',
  'ideas',
  'focus',
  'timeCapacity',
];
const dependencies: Record<PlannerDataCollection, readonly PlannerLibrarySlice[]> = {
  goals: ['goals', 'focus'],
  lifeActions: ['actions', 'focus'],
  directions: ['directions'],
  spheres: ['spheres'],
  inboxIdeas: ['ideas'],
  timeCapacity: ['timeCapacity'],
  focusPeriods: ['focus'],
  planningPeriods: ['focus'],
  periodMemberships: ['focus'],
  periodDecisions: ['focus'],
  recurrenceRules: ['focus'],
  contributionLinks: ['focus'],
  progressContributions: ['focus'],
};
const emptySnapshot: PlannerLibrarySnapshot = { data: null, refreshing: false, error: null };
const emptyData: PlannerLibraryData = {
  goals: [],
  directions: [],
  spheres: [],
  actions: [],
  ideas: [],
  focus: null,
  timeCapacity: [null, null, null, null, null, null, null],
};

/** A disposable view subscription, never an authoritative store of domain state. */
export class PlannerLibraryReadModel {
  #snapshot = emptySnapshot;
  readonly #listeners = new Set<() => void>();
  readonly #waiters = new Set<() => void>();
  readonly #dirty = new Set<PlannerLibrarySlice>();
  #unsubscribe: (() => void) | null = null;
  #generation = 0;
  #queued = false;
  #running = false;
  #disposed = false;

  public constructor(
    private readonly readers: PlannerLibraryReaders,
    private readonly changes: CommittedPlannerChanges,
    private readonly today: string,
    private readonly lifetime: {
      activate: (model: PlannerLibraryReadModel) => void;
      deactivate: (model: PlannerLibraryReadModel) => void;
    },
  ) {
    DayDate.create(today);
  }

  public readonly getSnapshot = (): PlannerLibrarySnapshot => this.#snapshot;

  public readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) throw new Error('Модель чтения закрыта.');
    if (this.#listeners.size === 0) this.lifetime.activate(this);
    const entry = () => listener();
    this.#listeners.add(entry);
    if (this.#listeners.size === 1) {
      this.#unsubscribe = this.changes.subscribe((collections) => {
        this.#invalidate(collections.flatMap((collection) => dependencies[collection]));
      });
      this.#invalidate(slices);
    }
    return () => {
      if (!this.#listeners.delete(entry)) return;
      if (this.#listeners.size === 0) this.#reset();
    };
  };

  public readonly refresh = (selected: readonly PlannerLibrarySlice[] = slices): Promise<void> => {
    if (this.#listeners.size > 0 && !this.#disposed) this.#invalidate(selected);
    return this.whenSettled();
  };

  public readonly whenSettled = (): Promise<void> => {
    if (!this.#queued && !this.#running) return Promise.resolve();
    return new Promise((resolve) => this.#waiters.add(resolve));
  };

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#reset();
    this.#notify();
    this.#listeners.clear();
  }

  #reset(): void {
    this.#generation++;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#dirty.clear();
    this.#running = false;
    this.#queued = false;
    this.#snapshot = emptySnapshot;
    this.lifetime.deactivate(this);
    this.#settle();
  }

  #invalidate(selected: readonly PlannerLibrarySlice[]): void {
    for (const slice of selected) this.#dirty.add(slice);
    this.#schedule();
  }

  #schedule(): void {
    if (
      this.#disposed ||
      this.#listeners.size === 0 ||
      this.#running ||
      this.#queued ||
      this.#dirty.size === 0
    )
      return;
    const generation = this.#generation;
    this.#queued = true;
    queueMicrotask(() => {
      if (generation !== this.#generation) return;
      this.#queued = false;
      void this.#readBatch(generation);
    });
    if (!this.#snapshot.refreshing) this.#publish({ ...this.#snapshot, refreshing: true });
  }

  async #readBatch(generation: number): Promise<void> {
    this.#running = true;
    const selected = [...this.#dirty];
    this.#dirty.clear();
    const results = await Promise.allSettled(selected.map((slice) => this.#readSlice(slice)));
    if (generation !== this.#generation) return;
    this.#running = false;
    // A commit may arrive while reading, including legacy focus materialization.
    if (selected.some((slice) => this.#dirty.has(slice))) {
      for (const slice of selected) this.#dirty.add(slice);
      this.#schedule();
      return;
    }
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      for (const slice of selected) this.#dirty.add(slice);
      const reason: unknown = failure.reason;
      this.#publish({
        ...this.#snapshot,
        refreshing: false,
        error:
          reason instanceof Error
            ? reason
            : new Error('Не удалось загрузить данные. Повторите попытку.'),
      });
      this.#settle();
      return;
    }
    let data = this.#snapshot.data ?? emptyData;
    for (const result of results)
      if (result.status === 'fulfilled') data = { ...data, ...result.value };
    this.#publish({ data, error: null, refreshing: this.#dirty.size > 0 });
    if (generation !== this.#generation) return;
    if (this.#dirty.size > 0) this.#schedule();
    else this.#settle();
  }

  async #readSlice(slice: PlannerLibrarySlice): Promise<Partial<PlannerLibraryData>> {
    switch (slice) {
      case 'goals':
        return { goals: await this.readers.getGoals() };
      case 'directions':
        return { directions: await this.readers.getDirections() };
      case 'spheres': {
        const spheres = await this.readers.getSpheres();
        return { spheres: [...spheres.active, ...spheres.archived] };
      }
      case 'actions':
        return { actions: await this.readers.getActions() };
      case 'ideas':
        return { ideas: await this.readers.getIdeas() };
      case 'focus':
        return { focus: await this.readers.getFocus(this.today) };
      case 'timeCapacity':
        return { timeCapacity: await this.readers.getTimeCapacity() };
    }
  }

  #publish(snapshot: PlannerLibrarySnapshot): void {
    this.#snapshot = snapshot;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        /* An observer must not break the read queue or other subscribers. */
      }
    }
  }

  #settle(): void {
    const waiters = [...this.#waiters];
    this.#waiters.clear();
    for (const resolve of waiters) resolve();
  }
}
