import { describe, expect, it } from 'vitest';
import { buildDayAutopilotPlan, type DayAutopilotActionInput } from './DayAutopilot';

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
