import { describe, expect, it, vi } from 'vitest';
import type {
  CommittedPlannerChanges,
  PlannerDataCollection,
} from '../ports/CommittedPlannerChanges';
import type { PlannerLibraryReaders } from './PlannerLibraryReadModel';
import { PlannerLibraryReadModels } from './PlannerLibraryReadModels';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup() {
  const listeners = new Set<(collections: readonly PlannerDataCollection[]) => void>();
  const changes: CommittedPlannerChanges = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const readers = {
    getGoals: vi.fn<PlannerLibraryReaders['getGoals']>().mockResolvedValue([]),
    getDirections: vi.fn<PlannerLibraryReaders['getDirections']>().mockResolvedValue([]),
    getSpheres: vi
      .fn<PlannerLibraryReaders['getSpheres']>()
      .mockResolvedValue({ active: [], archived: [] }),
    getActions: vi.fn<PlannerLibraryReaders['getActions']>().mockResolvedValue([]),
    getIdeas: vi.fn<PlannerLibraryReaders['getIdeas']>().mockResolvedValue([]),
    getFocus: vi.fn<PlannerLibraryReaders['getFocus']>().mockResolvedValue(null),
    getTimeCapacity: vi
      .fn<PlannerLibraryReaders['getTimeCapacity']>()
      .mockResolvedValue([null, null, null, null, null, null, null]),
  };
  const factory = new PlannerLibraryReadModels(readers, changes);
  const model = factory.create('2026-09-30');
  const emit = (...collections: PlannerDataCollection[]) =>
    listeners.forEach((listener) => listener(collections));
  const clear = () => Object.values(readers).forEach((reader) => reader.mockClear());
  const start = async () => {
    const stop = model.subscribe(() => {});
    await model.whenSettled();
    clear();
    return stop;
  };
  return { readers, model, factory, emit, clear, start, listeners };
}

describe('planner library read sessions', () => {
  it('is lazy and publishes a complete snapshot with stable identity', async () => {
    const { model, readers, listeners } = setup();
    const capacity = deferred<readonly (number | null)[]>();
    readers.getTimeCapacity.mockReturnValueOnce(capacity.promise);
    expect(listeners.size).toBe(0);
    expect(model.getSnapshot()).toEqual({ data: null, error: null, refreshing: false });
    expect(model.getSnapshot()).toBe(model.getSnapshot());
    await model.refresh();
    expect(readers.getActions).not.toHaveBeenCalled();
    const stop = model.subscribe(() => {});
    await Promise.resolve();
    expect(model.getSnapshot().data).toBeNull();
    expect(listeners.size).toBe(1);
    capacity.resolve([60, null, null, null, null, null, null]);
    await model.whenSettled();
    expect(model.getSnapshot().data?.timeCapacity[0]).toBe(60);
    for (const reader of Object.values(readers)) expect(reader).toHaveBeenCalledOnce();
    expect(model.getSnapshot()).toBe(model.getSnapshot());
    stop();
  });

  it.each([
    ['directions', ['getDirections']],
    ['spheres', ['getSpheres']],
    ['inboxIdeas', ['getIdeas']],
    ['timeCapacity', ['getTimeCapacity']],
    ['goals', ['getGoals', 'getFocus']],
    ['lifeActions', ['getActions', 'getFocus']],
    ['focusPeriods', ['getFocus']],
    ['planningPeriods', ['getFocus']],
    ['periodMemberships', ['getFocus']],
    ['periodDecisions', ['getFocus']],
    ['recurrenceRules', ['getFocus']],
    ['contributionLinks', ['getFocus']],
    ['progressContributions', ['getFocus']],
  ] satisfies [PlannerDataCollection, string[]][])(
    'invalidates only dependencies of %s and coalesces synchronous bursts',
    async (collection, expected) => {
      const { start, emit, model, readers } = setup();
      const stop = await start();
      const before = model.getSnapshot().data;
      emit(collection);
      emit(collection);
      emit(collection);
      await model.whenSettled();
      for (const [name, reader] of Object.entries(readers))
        expect(reader).toHaveBeenCalledTimes(expected.includes(name) ? 1 : 0);
      if (collection === 'timeCapacity')
        expect(model.getSnapshot().data?.goals).toBe(before?.goals);
      stop();
    },
  );

  it('discards a stale batch and joins one trailing batch without parallel reads', async () => {
    const { start, model, readers, emit } = setup();
    const stop = await start();
    const old = model.getSnapshot().data;
    const first = deferred<readonly (number | null)[]>();
    const second = deferred<readonly (number | null)[]>();
    readers.getTimeCapacity.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    emit('timeCapacity');
    await Promise.resolve();
    emit('timeCapacity');
    emit('timeCapacity');
    expect(readers.getTimeCapacity).toHaveBeenCalledOnce();
    first.resolve([10]);
    // Drain promise continuations, without a timing-dependent sleep.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(readers.getTimeCapacity).toHaveBeenCalledTimes(2);
    expect(model.getSnapshot().data).toBe(old);
    second.resolve([20]);
    await model.whenSettled();
    expect(model.getSnapshot().data?.timeCapacity).toEqual([20]);
    stop();
  });

  it('retains data on failure, awaits other reads and retries dirty slices on a commit', async () => {
    const { start, model, readers, emit } = setup();
    const stop = await start();
    const before = model.getSnapshot().data;
    const pending = deferred<readonly (number | null)[]>();
    readers.getDirections.mockRejectedValueOnce(new Error('offline'));
    readers.getTimeCapacity.mockReturnValueOnce(pending.promise);
    emit('directions', 'timeCapacity');
    let settled = false;
    const waiting = model.whenSettled().then(() => {
      settled = true;
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve([10]);
    await waiting;
    expect(model.getSnapshot().data).toBe(before);
    expect(model.getSnapshot().error?.message).toBe('offline');
    await model.whenSettled();
    expect(readers.getDirections).toHaveBeenCalledOnce();
    emit('spheres');
    await model.whenSettled();
    expect(readers.getDirections).toHaveBeenCalledTimes(2);
    expect(readers.getTimeCapacity).toHaveBeenCalledTimes(2);
    expect(readers.getGoals).not.toHaveBeenCalled();
    expect(model.getSnapshot().error).toBeNull();
    stop();
  });

  it('retries first-load failures and does not invalidate on whenSettled', async () => {
    const { model, readers } = setup();
    readers.getGoals.mockRejectedValueOnce('unavailable');
    const stop = model.subscribe(() => {});
    await model.whenSettled();
    expect(model.getSnapshot().data).toBeNull();
    expect(model.getSnapshot().error?.message).toBe(
      'Не удалось загрузить данные. Повторите попытку.',
    );
    await model.whenSettled();
    expect(readers.getGoals).toHaveBeenCalledOnce();
    await model.refresh();
    expect(model.getSnapshot().data).not.toBeNull();
    for (const reader of Object.values(readers)) expect(reader).toHaveBeenCalledTimes(2);
    stop();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores late %s after StrictMode cleanup and releases waiters',
    async (outcome) => {
      const { model, readers, listeners } = setup();
      const old = deferred<readonly (number | null)[]>();
      readers.getTimeCapacity.mockReturnValueOnce(old.promise);
      const stop = model.subscribe(() => {});
      await Promise.resolve();
      const waiting = model.whenSettled();
      stop();
      stop();
      await waiting;
      expect(listeners.size).toBe(0);
      expect(model.getSnapshot().data).toBeNull();
      const stopAgain = model.subscribe(() => {});
      await model.whenSettled();
      const current = model.getSnapshot();
      if (outcome === 'resolve') old.resolve([999]);
      else old.reject(new Error('old failure'));
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(model.getSnapshot()).toBe(current);
      expect(listeners.size).toBe(1);
      stopAgain();
    },
  );

  it('keeps one source listener until the last unsubscribe and closes dormant sessions too', async () => {
    const { factory, model, listeners, start, readers, emit } = setup();
    const dormant = factory.create('2026-10-01');
    const stop = await start();
    const stopSecond = model.subscribe(() => {});
    stop();
    expect(listeners.size).toBe(1);
    factory.close();
    factory.close();
    stopSecond();
    expect(listeners.size).toBe(0);
    expect(model.getSnapshot().data).toBeNull();
    expect(() => factory.create('2026-10-02')).toThrow();
    expect(() => dormant.subscribe(() => {})).toThrow();
    emit('goals');
    await model.refresh();
    expect(readers.getGoals).not.toHaveBeenCalled();
  });

  it('uses the session date and rejects invalid dates before subscribing', async () => {
    const { factory, readers } = setup();
    expect(() => factory.create('invalid')).toThrow();
    const model = factory.create('2026-10-01');
    const stop = model.subscribe(() => {});
    await model.whenSettled();
    expect(readers.getFocus).toHaveBeenCalledExactlyOnceWith('2026-10-01');
    stop();
  });
});
