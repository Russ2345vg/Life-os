import { describe, expect, it } from 'vitest';
import {
  buildDayAutopilotPlan,
  type DayAutopilotActionInput,
  type DayAutopilotInput,
} from './DayAutopilot';
const date = '2026-10-10';
function action(id: string, start: number | null = null, minutes = 25): DayAutopilotActionInput {
  return {
    id,
    title: id,
    version: 1,
    plannedDate: date,
    isMain: false,
    priority: 'normal',
    estimateMinutes: minutes,
    scheduledStartMinute: start,
    scheduledDurationMinutes: start === null ? null : minutes,
    createdAt: '2026-10-09T00:00:00Z',
    protectedBySession: false,
  };
}
function plan(
  actions: readonly DayAutopilotActionInput[],
  options: Partial<DayAutopilotInput> = {},
) {
  return buildDayAutopilotPlan({
    date,
    mode: 'fill',
    startMinute: 540,
    endMinute: 900,
    capacityMinutes: 360,
    reserveRatio: 0.15,
    actions,
    groups: { main: [], focus: [], wishes: [], todayFallback: ['next'], excluded: [] },
    ...options,
  });
}
describe('autopilot review regressions', () => {
  it('tries the next wish candidate when the first was explicitly excluded', () => {
    const result = plan([action('a'), action('b')], {
      excludedActionIds: ['a'],
      groups: {
        main: [],
        focus: [],
        todayFallback: [],
        excluded: [],
        wishes: [{ reference: { kind: 'direction', id: 'order' }, actionIds: ['a', 'b'] }],
      },
    });
    expect(result.proposals.map((item) => item.actionId)).toEqual(['b']);
  });
  it('inserts recovery after retained work, including a long pause after four focus intervals', () => {
    const result = plan([action('fixed', 540, 60), action('next')]);
    expect(result.proposals[0]?.startMinute).toBe(605);
    expect(result.timeline).toContainEqual(
      expect.objectContaining({ kind: 'rest', startMinute: 600, endMinute: 605 }),
    );
    const long = plan([action('fixed', 540, 100), action('next')]);
    expect(long.proposals[0]?.startMinute).toBe(655);
    expect(long.timeline).toContainEqual(
      expect.objectContaining({
        kind: 'rest',
        title: 'Длинный отдых',
        startMinute: 640,
        endMinute: 655,
      }),
    );
  });
  it('counts future retained work in chronological order after an earlier new action', () => {
    const result = plan([action('fixed', 600, 25), action('first', null, 40), action('next')], {
      groups: { main: ['first'], focus: [], wishes: [], todayFallback: ['next'], excluded: [] },
    });
    expect(result.proposals.map((item) => [item.actionId, item.startMinute])).toEqual([
      ['first', 540],
      ['next', 630],
    ]);
    expect(result.timeline).toContainEqual(
      expect.objectContaining({ kind: 'rest', startMinute: 625, endMinute: 630 }),
    );
  });
  it('uses an existing recovery block instead of adding a duplicate pause', () => {
    for (const kind of ['rest', 'walk'] as const) {
      const result = plan([action('fixed', 540), action('next')], {
        constraints: [
          {
            id: kind,
            kind,
            title: kind,
            startMinute: 565,
            endMinute: kind === 'walk' ? 595 : 570,
            sourceId: kind,
            actionId: null,
            protected: true,
          },
        ],
      });
      expect(result.proposals[0]?.startMinute).toBe(kind === 'walk' ? 595 : 570);
      expect(
        result.timeline?.filter((block) => block.kind === 'rest' && !block.protected),
      ).toHaveLength(0);
    }
  });
});
