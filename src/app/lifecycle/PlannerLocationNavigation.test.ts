import { describe, expect, it, vi } from 'vitest';
import {
  createPlannerLocationNavigation,
  type PlannerLocationBrowser,
} from './PlannerLocationNavigation';
import type { PlannerLocation } from '../../presentation/planner-v2/PlannerLocation';

function browser(initialHash = '#/v2/today') {
  const entries: { hash: string; state: unknown }[] = [
    { hash: initialHash, state: { foreign: 'keep' } },
  ];
  let index = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
    for (const listener of listeners) listener(); // popstate and hashchange for the same entry
  };
  const port: PlannerLocationBrowser = {
    read: () => entries[index]!,
    push: (hash, state) => {
      entries.splice(index + 1, entries.length - index - 1, { hash, state });
      index += 1;
    },
    replace: (hash, state) => {
      entries[index] = { hash, state };
    },
    go: (delta) => {
      index += delta;
      if (index < 0 || index >= entries.length) throw new Error('invalid history delta');
      emit();
    },
    listen: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    entries,
    current: () => entries[index]!,
    index: () => index,
    external: (hash: string) => {
      port.push(hash, { foreign: 'other' });
      emit();
    },
  };
}

describe('planner location navigation', () => {
  it('opens once, restores the source with Back/Close, and reopens with Forward', async () => {
    const fake = browser();
    const commit = vi.fn();
    const guard = vi.fn(async () => true);
    const navigation = createPlannerLocationNavigation(fake.port, guard, commit);
    navigation.start();

    expect(await navigation.openAction('first')).toBe(true);
    expect(fake.current().hash).toBe('#/v2/today?action=first');
    expect(fake.entries).toHaveLength(2);
    expect(fake.current().state).toMatchObject({ foreign: 'keep' });
    fake.port.go(-1);
    await vi.waitFor(() => expect(navigation.location.actionPanel).toBeNull());
    fake.port.go(1);
    await vi.waitFor(() => expect(navigation.location.actionPanel?.actionId).toBe('first'));
    expect(await navigation.closeAction()).toBe(true);
    expect(fake.index()).toBe(0);
    expect(fake.current().hash).toBe('#/v2/today');
    expect(commit).toHaveBeenCalledTimes(4);
    navigation.stop();
  });

  it('replaces A with B and does not add a second Back step', async () => {
    const fake = browser();
    const navigation = createPlannerLocationNavigation(fake.port, async () => true, vi.fn());
    navigation.start();
    await navigation.openAction('A');
    await navigation.openAction('B');
    expect(fake.entries).toHaveLength(2);
    expect(fake.current().hash).toBe('#/v2/today?action=B');
    fake.port.go(-1);
    await vi.waitFor(() => expect(navigation.location.actionPanel).toBeNull());
    navigation.stop();
  });

  it('rejects Back by restoring its known history position without replacing the source', async () => {
    const fake = browser();
    const guard = vi.fn(
      async ({ from, to }: { from: PlannerLocation; to: PlannerLocation }) =>
        from.actionPanel === null || to.actionPanel !== null,
    );
    const navigation = createPlannerLocationNavigation(fake.port, guard, vi.fn());
    navigation.start();
    await navigation.openAction('draft');
    const sourceState = fake.entries[0]!.state;
    fake.port.go(-1);
    await vi.waitFor(() => expect(fake.index()).toBe(1));
    expect(navigation.location.actionPanel?.actionId).toBe('draft');
    expect(fake.entries[0]!.state).toBe(sourceState);
    expect(guard).toHaveBeenCalledTimes(2); // open + one Back, not the compensating traversal
    navigation.stop();
  });

  it('closes a direct overlay URL with replace and keeps foreign state fields', async () => {
    const fake = browser('#/v2/today?day=tomorrow&action=direct');
    const navigation = createPlannerLocationNavigation(fake.port, async () => true, vi.fn());
    navigation.start();
    expect(await navigation.closeAction()).toBe(true);
    expect(fake.entries).toHaveLength(1);
    expect(fake.current()).toMatchObject({
      hash: '#/v2/today?day=tomorrow',
      state: { foreign: 'keep' },
    });
    navigation.stop();
  });

  it('rebases an unknown boundary before crossing back to an older managed entry', async () => {
    const fake = browser();
    const navigation = createPlannerLocationNavigation(fake.port, async () => true, vi.fn());
    navigation.start();
    await navigation.openAction('one');
    fake.external('#/v2/goals');
    await vi.waitFor(() => expect(navigation.location.page.view).toBe('goals'));
    fake.port.go(-1);
    await vi.waitFor(() => expect(navigation.location.actionPanel?.actionId).toBe('one'));
    expect(fake.current().hash).toBe('#/v2/today?action=one');
    navigation.stop();
  });

  it('uses the latest browser position when two Back events arrive during one pending guard', async () => {
    const fake = browser();
    let resolveGuard: (value: boolean) => void = () => undefined;
    const guard = vi.fn(({ reason }: { reason: string }) =>
      reason === 'history'
        ? new Promise<boolean>((resolve) => (resolveGuard = resolve))
        : Promise.resolve(true),
    );
    const navigation = createPlannerLocationNavigation(fake.port, guard, vi.fn());
    navigation.start();
    await navigation.navigate({ view: 'goals' });
    await navigation.openAction('draft');
    fake.port.go(-1);
    fake.port.go(-1);
    await vi.waitFor(() => expect(guard).toHaveBeenCalledTimes(3));
    resolveGuard(false);
    await vi.waitFor(() => expect(guard).toHaveBeenCalledTimes(4));
    resolveGuard(false);
    await vi.waitFor(() => expect(fake.index()).toBe(2));
    expect(navigation.location.actionPanel?.actionId).toBe('draft');
    navigation.stop();
  });
});
