import { describe, expect, it } from 'vitest';
import {
  buildDayAutopilotPlan,
  type DayAutopilotInput,
  type DayAutopilotActionInput,
} from './DayAutopilot';
const action = (id: string, minutes = 30): DayAutopilotActionInput => ({
  id,
  title: id,
  version: 1,
  isMain: false,
  priority: null,
  estimateMinutes: minutes,
  scheduledStartMinute: null,
  scheduledDurationMinutes: null,
  createdAt: '2026-10-01T00:00:00Z',
  protectedBySession: false,
  plannedDate: null,
});
const input = (changes: Partial<DayAutopilotInput> = {}): DayAutopilotInput => ({
  date: '2026-10-11',
  mode: 'rebuild',
  startMinute: 540,
  endMinute: 1020,
  capacityMinutes: 480,
  reserveRatio: 0.15,
  maxActions: 12,
  actions: [action('a'), action('b'), action('c')],
  groups: { main: [], focus: ['a', 'b', 'c'], wishes: [], todayFallback: [], excluded: [] },
  ...changes,
});
describe('organized day scheduling', () => {
  it('keeps the feasible balanced plan when grouping would lose a selected action', () => {
    const plan = buildDayAutopilotPlan(
      input({
        endMinute: 850,
        groupSimilar: true,
        actions: [
          { ...action('a'), contextKey: 'computer' },
          { ...action('b', 60), contextKey: 'home' },
          { ...action('c'), contextKey: 'computer' },
        ],
        constraints: [
          {
            id: 'manual-1',
            kind: 'manual',
            title: 'Fixed',
            startMinute: 635,
            endMinute: 700,
            actionId: null,
            sourceId: null,
            protected: true,
          },
          {
            id: 'manual-2',
            kind: 'manual',
            title: 'Fixed',
            startMinute: 740,
            endMinute: 800,
            actionId: null,
            sourceId: null,
            protected: true,
          },
        ],
        groups: {
          main: [],
          focus: [],
          wishes: [],
          todayFallback: [],
          excluded: [],
          balance: [
            { directionId: 'invest', percent: 50, actionIds: ['a', 'c'] },
            { directionId: 'home', percent: 50, actionIds: ['b'] },
          ],
        },
      }),
    );
    expect(plan.proposals.map((item) => item.actionId)).toEqual(['a', 'b', 'c']);
    expect(plan.proposals.find((item) => item.actionId === 'b')?.startMinute).toBe(575);
    expect(plan.balanceSummary?.map((item) => item.plannedMinutes)).toEqual([60, 60]);
  });
  it.each(['excluded', 'missing'] as const)(
    'rejects a fixed walk with an %s prerequisite',
    (state) => {
      expect(() =>
        buildDayAutopilotPlan(
          input({
            actions: state === 'missing' ? [action('c', 60)] : [action('a'), action('c', 60)],
            excludedActionIds: state === 'excluded' ? ['a'] : [],
            actionRules: [{ actionId: 'c', context: null, prerequisiteIds: ['a'] }],
            constraints: [
              {
                id: 'walk',
                kind: 'walk',
                title: 'Walk',
                startMinute: 720,
                endMinute: 780,
                actionId: 'c',
                sourceId: 'c',
                protected: false,
              },
            ],
          }),
        ),
      ).toThrow('предшественника');
    },
  );
  it('prepares a fixed walk before choosing optional work', () => {
    const plan = buildDayAutopilotPlan(
      input({
        actions: [action('b', 150), action('a'), action('c', 60)],
        actionRules: [{ actionId: 'c', context: null, prerequisiteIds: ['a'] }],
        constraints: [
          {
            id: 'walk',
            kind: 'walk',
            title: 'Walk',
            startMinute: 575,
            endMinute: 635,
            actionId: 'c',
            sourceId: 'c',
            protected: false,
          },
        ],
        groups: { main: ['b'], focus: [], wishes: [], todayFallback: [], excluded: [] },
      }),
    );
    const preparation = plan.proposals.find((item) => item.actionId === 'a')!;
    expect(preparation.reason).toBe('dependency');
    expect(preparation.startMinute + preparation.durationMinutes).toBeLessThanOrEqual(575);
  });
  it.each([
    { groupSimilar: false, mode: 'rebuild' as const },
    { groupSimilar: true, mode: 'rebuild' as const },
    { groupSimilar: false, mode: 'fill' as const },
    { groupSimilar: true, mode: 'fill' as const },
  ])('excludes walk-backed windows from work percentages (%j)', ({ groupSimilar, mode }) => {
    const plan = buildDayAutopilotPlan(
      input({
        groupSimilar,
        mode,
        actions: [
          action('a', 60),
          {
            ...action('c', 60),
            plannedDate: '2026-10-11',
            scheduledStartMinute: mode === 'fill' ? 720 : null,
            scheduledDurationMinutes: mode === 'fill' ? 60 : null,
          },
        ],
        constraints: [
          {
            id: 'walk',
            kind: 'walk',
            title: 'Walk',
            startMinute: 720,
            endMinute: 780,
            actionId: 'c',
            sourceId: 'c',
            protected: false,
          },
        ],
        groups: {
          main: [],
          focus: [],
          wishes: [],
          todayFallback: [],
          excluded: [],
          balance: [{ directionId: 'invest', percent: 100, actionIds: ['a'] }],
        },
      }),
    );
    expect(plan.balanceSummary).toEqual([
      { directionId: 'invest', targetPercent: 100, plannedMinutes: 60, actualPercent: 100 },
    ]);
  });
  it('ignores a direction-linked walk when allocating balanced work', () => {
    const plan = buildDayAutopilotPlan(
      input({
        maxActions: 3,
        constraints: [
          {
            id: 'walk',
            kind: 'walk',
            title: 'Walk',
            startMinute: 720,
            endMinute: 780,
            actionId: 'c',
            sourceId: 'c',
            protected: false,
          },
        ],
        groups: {
          main: [],
          focus: [],
          wishes: [],
          todayFallback: [],
          excluded: [],
          balance: [
            { directionId: 'invest', percent: 50, actionIds: ['a', 'c'] },
            { directionId: 'home', percent: 50, actionIds: ['b'] },
          ],
        },
      }),
    );
    expect(plan.proposals.map((item) => item.actionId)).toEqual(['c', 'a', 'b']);
    expect(plan.balanceSummary?.map((item) => item.plannedMinutes)).toEqual([30, 30]);
  });
  it('does not count past work outside the planning range towards the new balance', () => {
    const plan = buildDayAutopilotPlan(
      input({
        actions: [
          {
            ...action('a', 60),
            plannedDate: '2026-10-11',
            scheduledStartMinute: 420,
            scheduledDurationMinutes: 60,
          },
          action('b', 40),
        ],
        groups: {
          main: [],
          focus: [],
          wishes: [],
          todayFallback: [],
          excluded: [],
          balance: [
            { directionId: 'invest', percent: 60, actionIds: ['a'] },
            { directionId: 'home', percent: 40, actionIds: ['b'] },
          ],
        },
      }),
    );
    expect(plan.balanceSummary?.map((item) => item.plannedMinutes)).toEqual([0, 40]);
  });
  it('preserves a matching pinned window while its focus session is active', () => {
    const plan = buildDayAutopilotPlan(
      input({
        actions: [
          {
            ...action('a'),
            plannedDate: '2026-10-11',
            scheduledStartMinute: 540,
            scheduledDurationMinutes: 30,
            protectedBySession: true,
          },
          action('b'),
        ],
        pinnedWindows: [{ actionId: 'a', startMinute: 540, durationMinutes: 30 }],
      }),
    );
    expect(plan.locked.find((item) => item.actionId === 'a')?.reason).toBe('active_session');
  });
  it('reserves prerequisites before pinned dependents before allocating other directions', () => {
    const plan = buildDayAutopilotPlan(
      input({
        pinnedWindows: [{ actionId: 'a', startMinute: 575, durationMinutes: 30 }],
        actionRules: [{ actionId: 'a', context: null, prerequisiteIds: ['c'] }],
        groups: {
          main: [],
          focus: [],
          wishes: [],
          todayFallback: [],
          excluded: [],
          balance: [
            { directionId: 'invest', percent: 60, actionIds: ['a', 'c'] },
            { directionId: 'home', percent: 40, actionIds: ['b'] },
          ],
        },
      }),
    );
    const c = plan.proposals.find((item) => item.actionId === 'c')!;
    expect(c.startMinute + c.durationMinutes).toBeLessThanOrEqual(575);
  });
  it('groups selected balanced work across direction turns without dropping the other direction', () => {
    const plan = buildDayAutopilotPlan(
      input({
        groupSimilar: true,
        actions: [
          { ...action('a'), contextKey: 'computer' },
          { ...action('b'), contextKey: 'home' },
          { ...action('c'), contextKey: 'computer' },
        ],
        groups: {
          main: [],
          focus: [],
          wishes: [],
          todayFallback: [],
          excluded: [],
          balance: [
            { directionId: 'invest', percent: 60, actionIds: ['a', 'c'] },
            { directionId: 'home', percent: 40, actionIds: ['b'] },
          ],
        },
      }),
    );
    expect(plan.proposals.map((item) => item.actionId)).toEqual(['a', 'c', 'b']);
  });
  it('allows rebuilding after a pinned action has been completed', () => {
    const plan = buildDayAutopilotPlan(
      input({
        actions: [action('b'), action('c')],
        completedActionIds: ['a'],
        pinnedWindows: [{ actionId: 'a', startMinute: 540, durationMinutes: 30 }],
      }),
    );
    expect(plan.proposals.map((item) => item.actionId)).toEqual(['b', 'c']);
  });
  it('chooses work from every weighted direction rather than only the main focus', () => {
    const plan = buildDayAutopilotPlan(
      input({
        actions: [action('a', 60), action('b', 40)],
        groups: {
          main: [],
          focus: ['a'],
          wishes: [],
          todayFallback: [],
          excluded: [],
          balance: [
            { directionId: 'invest', percent: 60, actionIds: ['a'] },
            { directionId: 'home', percent: 40, actionIds: ['b'] },
          ],
        },
      }),
    );
    expect(plan.proposals.map((p) => p.actionId)).toEqual(['a', 'b']);
    expect(plan.balanceSummary).toEqual([
      { directionId: 'invest', targetPercent: 60, plannedMinutes: 60, actualPercent: 60 },
      { directionId: 'home', targetPercent: 40, plannedMinutes: 40, actualPercent: 40 },
    ]);
  });
  it('groups work with the same explicit context', () => {
    const plan = buildDayAutopilotPlan(
      input({
        groupSimilar: true,
        actionRules: [
          { actionId: 'a', context: 'Компьютер', prerequisiteIds: [] },
          { actionId: 'b', context: 'Дом', prerequisiteIds: [] },
          { actionId: 'c', context: 'Компьютер', prerequisiteIds: [] },
        ],
      }),
    );
    expect(plan.proposals.map((p) => p.actionId)).toEqual(['a', 'c', 'b']);
  });
  it('puts a prerequisite before its dependent even when dependent has first priority', () => {
    const plan = buildDayAutopilotPlan(
      input({ actionRules: [{ actionId: 'a', context: null, prerequisiteIds: ['c'] }] }),
    );
    expect(plan.proposals.map((p) => p.actionId)).toEqual(['c', 'a', 'b']);
  });
  it('does not schedule a dependent of an excluded prerequisite', () => {
    const plan = buildDayAutopilotPlan(
      input({
        excludedActionIds: ['c'],
        actionRules: [{ actionId: 'a', context: null, prerequisiteIds: ['c'] }],
      }),
    );
    expect(plan.proposals.some((p) => p.actionId === 'a')).toBe(false);
    expect(plan.deferred.find((p) => p.actionId === 'a')?.reason).toBe('dependency');
  });
  it('preserves an unapplied pinned window during rebuild and includes it in apply proposals', () => {
    const plan = buildDayAutopilotPlan(
      input({ pinnedWindows: [{ actionId: 'a', startMinute: 720, durationMinutes: 60 }] }),
    );
    expect(plan.proposals.find((p) => p.actionId === 'a')).toMatchObject({
      startMinute: 720,
      durationMinutes: 60,
      reason: 'pinned',
    });
    expect(plan.timeline?.find((b) => b.actionId === 'a')?.protected).toBe(true);
  });
  it('rejects a pin conflicting with evening preparation instead of silently moving it', () => {
    expect(() =>
      buildDayAutopilotPlan(
        input({
          pinnedWindows: [{ actionId: 'a', startMinute: 960, durationMinutes: 60 }],
          constraints: [
            {
              id: 'evening',
              kind: 'evening',
              title: 'Вечер',
              startMinute: 990,
              endMinute: 1020,
              actionId: null,
              sourceId: null,
              protected: true,
            },
          ],
        }),
      ),
    ).toThrow();
  });
});
