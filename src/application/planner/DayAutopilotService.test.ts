import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  DayDate,
  EntityId,
  type LifeAction,
  timeInBedMilliseconds,
} from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { DayAutopilotService } from './DayAutopilotService';

const date = DayDate.create('2026-10-04');

function plannedAction(id: string, main = false, estimateMinutes: number | null = 25) {
  const value = createLifeActionDraft(id);
  value.setPlan(date, main);
  value.setTimePlanning({
    estimateMinutes,
    scheduledStartMinute: null,
    scheduledDurationMinutes: null,
  });
  return value;
}

function repository(actions: readonly LifeAction[]): LifeActionRepository {
  return {
    findById: async (id) => actions.find((item) => item.id.equals(id)) ?? null,
    findByDate: async () => actions,
    findByDecisionId: async () => [],
    findAll: async () => actions,
    save: async () => undefined,
  };
}

const noSessions: ActionSessionRepository = {
  all: async () => [],
  findById: async () => null,
};

describe('DayAutopilotService', () => {
  it('builds a preview from capacity and increases reserve after a confirmed short night', async () => {
    const main = plannedAction('main', true, 50);
    const sleep = {
      id: 'sleep',
      cycleDate: '2026-10-03',
      nightCycleId: null,
      wentToBedAt: new Date('2026-10-03T16:00:00.000Z'),
      wokeAt: new Date('2026-10-03T22:00:00.000Z'),
      wakeSource: 'MANUAL' as const,
      wakeOccurrenceId: null,
      timeZone: 'Asia/Chita',
      confirmedAt: new Date('2026-10-03T22:01:00.000Z'),
      createdAt: new Date('2026-10-03T22:01:00.000Z'),
      updatedAt: new Date('2026-10-03T22:01:00.000Z'),
    };
    expect(timeInBedMilliseconds(sleep)).toBe(6 * 60 * 60 * 1000);
    const service = new DayAutopilotService({
      actions: repository([main]),
      sessions: noSessions,
      unitOfWork: { commit: vi.fn() },
      capacity: { get: async () => [null, null, null, null, null, null, 400] },
      sleep: { history: async () => [sleep] },
      clock: { now: () => new Date('2026-10-04T00:00:00.000Z') },
      currentDate: { getCurrentDate: () => date },
    });

    const preview = await service.preview({ date, startMinute: 540, mode: 'fill' });

    expect(preview.capacityAssumed).toBe(false);
    expect(preview.recoverySignal).toEqual({ kind: 'short_night', minutes: 360 });
    expect(preview.reserveMinutes).toBe(100);
    expect(preview.proposals[0]).toEqual(
      expect.objectContaining({ actionId: 'main', startMinute: 540, durationMinutes: 50 }),
    );
  });

  it('uses an explicit eight hour fallback when capacity is not configured', async () => {
    const service = new DayAutopilotService({
      actions: repository([plannedAction('task')]),
      sessions: noSessions,
      unitOfWork: { commit: vi.fn() },
      capacity: { get: async () => [null, null, null, null, null, null, null] },
      sleep: { history: async () => [] },
      clock: { now: () => new Date('2026-10-04T00:00:00.000Z') },
      currentDate: { getCurrentDate: () => date },
    });

    const preview = await service.preview({ date, startMinute: 540, mode: 'fill' });

    expect(preview.capacityMinutes).toBe(480);
    expect(preview.capacityAssumed).toBe(true);
  });

  it('applies every proposed window in one guarded commit', async () => {
    const main = plannedAction('main', true, 50);
    const secondary = plannedAction('secondary');
    const commit = vi.fn<JournalUnitOfWork['commit']>(async () => undefined);
    const service = new DayAutopilotService({
      actions: repository([main, secondary]),
      sessions: noSessions,
      unitOfWork: { commit },
      capacity: { get: async () => [null, null, null, null, null, null, 180] },
      sleep: { history: async () => [] },
      clock: { now: () => new Date('2026-10-04T00:00:00.000Z') },
      currentDate: { getCurrentDate: () => date },
    });
    const preview = await service.preview({ date, startMinute: 540, mode: 'fill' });

    const result = await service.apply(preview);

    expect(result.updatedCount).toBe(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        inactiveSessionActionIds: [main.id, secondary.id],
        lifeActions: [
          expect.objectContaining({ expectedVersion: preview.proposals[0]!.expectedVersion }),
          expect.objectContaining({ expectedVersion: preview.proposals[1]!.expectedVersion }),
        ],
        journalEntries: [],
      }),
    );
    expect(main.scheduledStartMinute).toBe(540);
    expect(secondary.scheduledStartMinute).toBe(595);
  });

  it('protects a running action from preview changes', async () => {
    const active = plannedAction('active', true, 50);
    const session = ActionSession.start({
      id: EntityId.create('session'),
      lifeActionId: active.id,
      goalIdAtStart: null,
      startedAt: new Date('2026-10-04T00:00:00.000Z'),
      eventId: EntityId.create('session-event'),
    });
    const service = new DayAutopilotService({
      actions: repository([active]),
      sessions: { all: async () => [session], findById: async () => session },
      unitOfWork: { commit: vi.fn() },
      capacity: { get: async () => [null, null, null, null, null, null, 180] },
      sleep: { history: async () => [] },
      clock: { now: () => new Date('2026-10-04T00:00:00.000Z') },
      currentDate: { getCurrentDate: () => date },
    });

    const preview = await service.preview({ date, startMinute: 540, mode: 'rebuild' });

    expect(preview.proposals).toHaveLength(0);
    expect(preview.deferred).toEqual([
      expect.objectContaining({ actionId: 'active', reason: 'active_session' }),
    ]);
  });

  it('clamps rebuild to the current time so elapsed blocks remain protected', async () => {
    const timed = plannedAction('elapsed', false, 50);
    timed.setTimePlanning({
      estimateMinutes: 50,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 50,
    });
    const service = new DayAutopilotService({
      actions: repository([timed]),
      sessions: noSessions,
      unitOfWork: { commit: vi.fn() },
      capacity: { get: async () => [null, null, null, null, null, null, 240] },
      sleep: { history: async () => [] },
      clock: { now: () => new Date(2026, 9, 4, 12, 0) },
      currentDate: { getCurrentDate: () => date },
    });

    const preview = await service.preview({ date, startMinute: 540, mode: 'rebuild' });

    expect(preview.startMinute).toBe(720);
    expect(preview.locked).toEqual([
      expect.objectContaining({ actionId: 'elapsed', reason: 'past_window' }),
    ]);
  });

  it('clears a deferred future window in the same batch as rebuilt proposals', async () => {
    const main = plannedAction('rebuild-main', true, 50);
    const existing = plannedAction('rebuild-existing', false, 120);
    existing.setTimePlanning({
      estimateMinutes: 120,
      scheduledStartMinute: 550,
      scheduledDurationMinutes: 120,
    });
    const commit = vi.fn<JournalUnitOfWork['commit']>(async () => undefined);
    const service = new DayAutopilotService({
      actions: repository([main, existing]),
      sessions: noSessions,
      unitOfWork: { commit },
      capacity: { get: async () => [null, null, null, null, null, null, 100] },
      sleep: { history: async () => [] },
      clock: { now: () => new Date(2026, 9, 4, 8, 0) },
      currentDate: { getCurrentDate: () => date },
    });
    const preview = await service.preview({ date, startMinute: 540, mode: 'rebuild' });

    const result = await service.apply(preview);

    expect(result.updatedCount).toBe(2);
    expect(main.scheduledStartMinute).toBe(540);
    expect(existing.scheduledStartMinute).toBeNull();
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        inactiveSessionActionIds: [main.id, existing.id],
        lifeActions: [
          expect.objectContaining({ lifeAction: main }),
          expect.objectContaining({ lifeAction: existing }),
        ],
      }),
    );
  });

  it('rejects a rebuild when time passes an affected window before apply', async () => {
    const existing = plannedAction('late-apply-existing', false, 120);
    existing.setTimePlanning({
      estimateMinutes: 120,
      scheduledStartMinute: 550,
      scheduledDurationMinutes: 120,
    });
    let now = new Date(2026, 9, 4, 8, 0);
    const commit = vi.fn<JournalUnitOfWork['commit']>(async () => undefined);
    const service = new DayAutopilotService({
      actions: repository([existing]),
      sessions: noSessions,
      unitOfWork: { commit },
      capacity: { get: async () => [null, null, null, null, null, null, 100] },
      sleep: { history: async () => [] },
      clock: { now: () => now },
      currentDate: { getCurrentDate: () => date },
    });
    const preview = await service.preview({ date, startMinute: 540, mode: 'rebuild' });
    now = new Date(2026, 9, 4, 12, 0);

    await expect(service.apply(preview)).rejects.toMatchObject({
      code: 'day_autopilot.preview_stale',
    });
    expect(existing.scheduledStartMinute).toBe(550);
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a rebuild when the previous window starts before its proposed replacement', async () => {
    const elapsed = plannedAction('late-apply-elapsed', false, 65);
    elapsed.setTimePlanning({
      estimateMinutes: 65,
      scheduledStartMinute: 480,
      scheduledDurationMinutes: 65,
    });
    const moved = plannedAction('late-apply-moved', false, 25);
    moved.setTimePlanning({
      estimateMinutes: 25,
      scheduledStartMinute: 545,
      scheduledDurationMinutes: 25,
    });
    let now = new Date(2026, 9, 4, 9, 0);
    const commit = vi.fn<JournalUnitOfWork['commit']>(async () => undefined);
    const service = new DayAutopilotService({
      actions: repository([elapsed, moved]),
      sessions: noSessions,
      unitOfWork: { commit },
      capacity: { get: async () => [null, null, null, null, null, null, 180] },
      sleep: { history: async () => [] },
      clock: { now: () => now },
      currentDate: { getCurrentDate: () => date },
    });
    const preview = await service.preview({ date, startMinute: 540, mode: 'rebuild' });
    expect(preview.proposals).toEqual([
      expect.objectContaining({
        actionId: moved.id.toString(),
        previousStartMinute: 545,
        startMinute: 550,
      }),
    ]);
    now = new Date(2026, 9, 4, 9, 7);

    await expect(service.apply(preview)).rejects.toMatchObject({
      code: 'day_autopilot.preview_stale',
    });
    expect(moved.scheduledStartMinute).toBe(545);
    expect(commit).not.toHaveBeenCalled();
  });
});
