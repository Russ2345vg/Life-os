import { describe, expect, it } from 'vitest';
import { buildDayAutopilotPlan, type DayAutopilotActionInput } from './DayAutopilot';

describe('preference schedule', () => {
  const groups = {
    main: [],
    focus: ['long', 'short', 'extra'],
    wishes: [
      { reference: { kind: 'direction' as const, id: 'order' }, actionIds: ['household', 'short'] },
    ],
    todayFallback: [],
    excluded: [],
  };
  const config = {
    date: '2026-10-10',
    mode: 'fill' as const,
    startMinute: 540,
    endMinute: 900,
    capacityMinutes: 360,
    reserveRatio: 0.15,
    groups,
    maxActions: 5,
    constraints: [],
    pomodoro: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 },
    excludedActionIds: [],
    durationOverrides: [],
  };
  it('skips a long focus to fit a shorter focus then a wish without filling with unrelated tasks', () => {
    const plan = buildDayAutopilotPlan({
      ...config,
      actions: [
        action('long', { estimateMinutes: 500 }),
        action('short'),
        action('household'),
        action('extra'),
        action('unrelated'),
      ],
    });
    expect(plan.proposals.map((item) => item.actionId)).toEqual(['short', 'household', 'extra']);
    expect(plan.proposals.map((item) => item.reason)).toEqual(['focus', 'wish', 'focus']);
  });
  it('inserts real Pomodoro breaks only between work and respects the evening cutoff', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const plan = buildDayAutopilotPlan({
      ...config,
      groups: { ...groups, focus: ids, wishes: [] },
      startMinute: 1170,
      endMinute: 1440,
      constraints: [
        {
          id: 'evening',
          kind: 'evening' as const,
          title: 'Вечер',
          startMinute: 1335,
          endMinute: 1380,
          sourceId: null,
          actionId: null,
          protected: true,
        },
        {
          id: 'sleep',
          kind: 'sleep' as const,
          title: 'Сон',
          startMinute: 1380,
          endMinute: 1440,
          sourceId: null,
          actionId: null,
          protected: true,
        },
      ],
      actions: ids.map((id) => action(id)),
    });
    expect(plan.proposals.every((item) => item.startMinute + item.durationMinutes <= 1335)).toBe(
      true,
    );
    expect(
      plan.timeline
        ?.filter((block) => block.kind === 'rest')
        .map((block) => block.endMinute - block.startMinute),
    ).toEqual([5, 5, 5]);
    const longer = buildDayAutopilotPlan({
      ...config,
      groups: { ...groups, focus: ids, wishes: [] },
      actions: ids.map((id) => action(id)),
    });
    expect(
      longer.timeline
        ?.filter((block) => block.kind === 'rest')
        .map((block) => block.endMinute - block.startMinute),
    ).toEqual([5, 5, 5, 15]);
  });
  it('uses a reserve based on the union of mandatory constraints capped by actual remainder', () => {
    const plan = buildDayAutopilotPlan({
      ...config,
      endMinute: 600,
      reserveRatio: 0.25,
      constraints: [
        {
          id: 'walk',
          kind: 'walk' as const,
          title: 'Прогулка',
          startMinute: 540,
          endMinute: 590,
          sourceId: null,
          actionId: null,
          protected: true,
        },
      ],
      actions: [action('short')],
    });
    expect(plan.reserveMinutes).toBe(10);
    expect(plan.proposals).toEqual([]);
  });
  it('honors edits exclusions and the five action limit without splitting work', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `a${i}`);
    const plan = buildDayAutopilotPlan({
      ...config,
      endMinute: 1200,
      groups: { ...groups, focus: ids, wishes: [] },
      excludedActionIds: ['a0'],
      durationOverrides: [{ actionId: 'a1', minutes: 70 }],
      actions: ids.map((id) => action(id)),
    });
    expect(plan.proposals).toHaveLength(5);
    expect(plan.proposals[0]).toMatchObject({
      actionId: 'a1',
      durationMinutes: 70,
      estimateSource: 'user',
    });
    expect(plan.proposals.some((item) => item.actionId === 'a0')).toBe(false);
  });
});

const action = (
  id: string,
  overrides: Partial<DayAutopilotActionInput> = {},
): DayAutopilotActionInput => ({
  id,
  title: id,
  version: 1,
  isMain: false,
  priority: 'normal',
  estimateMinutes: 25,
  scheduledStartMinute: null,
  scheduledDurationMinutes: null,
  createdAt: '2026-10-04T06:00:00.000Z',
  protectedBySession: false,
  ...overrides,
});

describe('day autopilot', () => {
  it('puts the main action first and fits work around locked user windows', () => {
    const result = buildDayAutopilotPlan({
      date: '2026-10-04',
      mode: 'fill',
      startMinute: 540,
      capacityMinutes: 180,
      reserveRatio: 0.15,
      actions: [
        action('secondary'),
        action('locked', {
          scheduledStartMinute: 600,
          scheduledDurationMinutes: 60,
        }),
        action('main', { isMain: true, estimateMinutes: 50 }),
      ],
    });

    expect(result.reserveMinutes).toBe(30);
    expect(result.locked).toEqual([
      expect.objectContaining({ actionId: 'locked', startMinute: 600, durationMinutes: 60 }),
    ]);
    expect(result.proposals).toEqual([
      expect.objectContaining({ actionId: 'main', startMinute: 540, durationMinutes: 50 }),
      expect.objectContaining({ actionId: 'secondary', startMinute: 665, durationMinutes: 25 }),
    ]);
  });

  it('uses a visible 25 minute assumption and explains actions that do not fit', () => {
    const result = buildDayAutopilotPlan({
      date: '2026-10-04',
      mode: 'fill',
      startMinute: 900,
      capacityMinutes: 90,
      reserveRatio: 0.15,
      actions: [
        action('unknown', {
          estimateMinutes: null,
          createdAt: '2026-10-04T05:00:00.000Z',
        }),
        action('large', { estimateMinutes: 60 }),
      ],
    });

    expect(result.proposals).toEqual([
      expect.objectContaining({
        actionId: 'unknown',
        durationMinutes: 25,
        usedDefaultEstimate: true,
      }),
    ]);
    expect(result.deferred).toEqual([
      expect.objectContaining({ actionId: 'large', reason: 'no_capacity' }),
    ]);
  });

  it('rebuilds only the remaining day and never moves an active session', () => {
    const result = buildDayAutopilotPlan({
      date: '2026-10-04',
      mode: 'rebuild',
      startMinute: 720,
      capacityMinutes: 240,
      reserveRatio: 0.15,
      actions: [
        action('past', { scheduledStartMinute: 600, scheduledDurationMinutes: 60 }),
        action('active', {
          scheduledStartMinute: 735,
          scheduledDurationMinutes: 50,
          protectedBySession: true,
        }),
        action('main', {
          isMain: true,
          estimateMinutes: 50,
          scheduledStartMinute: 840,
          scheduledDurationMinutes: 50,
        }),
      ],
    });

    expect(result.locked.map((item) => item.actionId)).toEqual(['past', 'active']);
    expect(result.proposals).toEqual([
      expect.objectContaining({
        actionId: 'main',
        previousStartMinute: 840,
        startMinute: 790,
        durationMinutes: 50,
      }),
    ]);
  });

  it('gives high priority work precedence without displacing the main action', () => {
    const result = buildDayAutopilotPlan({
      date: '2026-10-04',
      mode: 'fill',
      startMinute: 540,
      capacityMinutes: 180,
      reserveRatio: 0.15,
      actions: [
        action('low', { priority: 'low' }),
        action('high', { priority: 'high' }),
        action('main', { isMain: true }),
      ],
    });

    expect(result.proposals.map((item) => item.actionId)).toEqual(['main', 'high', 'low']);
  });

  it('does not use time beyond the planning range before a later locked block', () => {
    const result = buildDayAutopilotPlan({
      date: '2026-10-04',
      mode: 'fill',
      startMinute: 540,
      capacityMinutes: 100,
      reserveRatio: 0.15,
      actions: [
        action('too-large', { estimateMinutes: 100 }),
        action('late-lock', {
          scheduledStartMinute: 1000,
          scheduledDurationMinutes: 30,
        }),
      ],
    });

    expect(result.proposals).toHaveLength(0);
    expect(result.deferred).toEqual([
      expect.objectContaining({ actionId: 'too-large', reason: 'no_capacity' }),
    ]);
  });

  it('keeps a five minute buffer on both sides of locked windows', () => {
    const result = buildDayAutopilotPlan({
      date: '2026-10-04',
      mode: 'fill',
      startMinute: 540,
      capacityMinutes: 190,
      reserveRatio: 0.15,
      actions: [
        action('candidate', { estimateMinutes: 60 }),
        action('locked', {
          scheduledStartMinute: 600,
          scheduledDurationMinutes: 30,
        }),
      ],
    });

    expect(result.proposals).toEqual([
      expect.objectContaining({ actionId: 'candidate', startMinute: 635 }),
    ]);
  });

  it('marks a deferred rebuild window for removal from the time grid', () => {
    const result = buildDayAutopilotPlan({
      date: '2026-10-04',
      mode: 'rebuild',
      startMinute: 540,
      capacityMinutes: 100,
      reserveRatio: 0.15,
      actions: [
        action('main', { isMain: true, estimateMinutes: 50 }),
        action('existing', {
          estimateMinutes: 120,
          scheduledStartMinute: 550,
          scheduledDurationMinutes: 120,
        }),
      ],
    });

    expect(result.proposals).toEqual([
      expect.objectContaining({ actionId: 'main', startMinute: 540 }),
    ]);
    expect(result.deferred).toEqual([
      expect.objectContaining({
        actionId: 'existing',
        expectedVersion: 1,
        hadScheduledWindow: true,
        previousStartMinute: 550,
      }),
    ]);
  });
});
