import { describe, expect, it } from 'vitest';
import type { Direction, Goal } from '../../domain';
import type { SpheresSnapshot } from '../../application/queries/GetSpheres';
import { createGoalAlbumLoader, type GoalAlbumQueries } from './GoalAlbumLoader';

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
}

function createDeferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | null = null;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      if (resolvePromise === null) throw new Error('Deferred promise is already resolved.');
      resolvePromise(value);
      resolvePromise = null;
    },
  };
}

describe('GoalAlbumLoader', () => {
  it('loads one parallel snapshot, caches it per instance, and refreshes it explicitly', async () => {
    const firstGoals = createDeferred<readonly Goal[]>();
    const firstDirections = createDeferred<readonly Direction[]>();
    const firstSpheres = createDeferred<SpheresSnapshot>();
    const secondGoals = createDeferred<readonly Goal[]>();
    const secondDirections = createDeferred<readonly Direction[]>();
    const secondSpheres = createDeferred<SpheresSnapshot>();
    let goalCalls = 0;
    let directionCalls = 0;
    let sphereCalls = 0;

    const queries: GoalAlbumQueries = {
      getGoals: {
        execute: () => {
          goalCalls += 1;
          return goalCalls === 1 ? firstGoals.promise : secondGoals.promise;
        },
      },
      getDirections: {
        execute: () => {
          directionCalls += 1;
          return directionCalls === 1 ? firstDirections.promise : secondDirections.promise;
        },
      },
      getSpheres: {
        execute: () => {
          sphereCalls += 1;
          return sphereCalls === 1 ? firstSpheres.promise : secondSpheres.promise;
        },
      },
    };
    const loader = createGoalAlbumLoader(queries);

    const firstLoad = loader.load();

    expect([goalCalls, directionCalls, sphereCalls]).toEqual([1, 1, 1]);
    expect(loader.load()).toBe(firstLoad);

    firstGoals.resolve([]);
    firstDirections.resolve([]);
    firstSpheres.resolve({ active: [], archived: [] });
    await expect(firstLoad).resolves.toEqual({
      goals: [],
      directions: [],
      spheres: { active: [], archived: [] },
    });
    expect(loader.load()).toBe(firstLoad);
    expect([goalCalls, directionCalls, sphereCalls]).toEqual([1, 1, 1]);

    const refreshed = loader.refresh();

    expect([goalCalls, directionCalls, sphereCalls]).toEqual([2, 2, 2]);
    expect(refreshed).not.toBe(firstLoad);

    secondGoals.resolve([]);
    secondDirections.resolve([]);
    secondSpheres.resolve({ active: [], archived: [] });
    await expect(refreshed).resolves.toEqual({
      goals: [],
      directions: [],
      spheres: { active: [], archived: [] },
    });
    expect(loader.load()).toBe(refreshed);
    expect([goalCalls, directionCalls, sphereCalls]).toEqual([2, 2, 2]);
  });

  it('does not share the cached snapshot with another loader instance', async () => {
    let calls = 0;
    const queries: GoalAlbumQueries = {
      getGoals: {
        execute: async () => {
          calls += 1;
          return [];
        },
      },
      getDirections: { execute: async () => [] },
      getSpheres: { execute: async () => ({ active: [], archived: [] }) },
    };

    await createGoalAlbumLoader(queries).load();
    await createGoalAlbumLoader(queries).load();

    expect(calls).toBe(2);
  });
});
