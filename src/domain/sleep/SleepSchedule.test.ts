import { describe, expect, it } from 'vitest';
import {
  addCustomPreparationItem,
  addPreparationGroup,
  completePreparationItem,
  createEmptySleepSchedule,
  deletePreparationGroup,
  deletePreparationItem,
  ensureNightCycle,
  finishPreparation,
  importNativeSleepEvents,
  importNativeWakeResults,
  movePreparationItem,
  rebuildWakeSchedule,
  selectSleepHistoryEntries,
  summarizeSleepHistory,
  setPreparationItemEnabled,
  setSleepFeatureEnabled,
  skipNearestWakeOccurrence,
  updateSleepSettings,
  WAKE_OCCURRENCE_STATUS,
} from './SleepSchedule';

describe('SleepSchedule', () => {
  it('seeds the approved groups and four protected base items', () => {
    const state = createEmptySleepSchedule();

    expect(state.preparationGroups.map(({ title }) => title)).toEqual([
      'Комната',
      'Утро',
      'Личное',
    ]);
    expect(state.preparationItems.map(({ title, kind }) => [title, kind])).toEqual([
      ['Проветрить комнату', 'BASE'],
      ['Подготовить кровать', 'BASE'],
      ['Подготовить одежду', 'BASE'],
      ['Поставить стакан воды', 'BASE'],
    ]);
    expect(() => deletePreparationItem(state, state.preparationItems[0]!.id)).toThrow(
      'Базовый пункт нельзя удалить',
    );
    expect(() => setPreparationItemEnabled(state, state.preparationItems[0]!.id, false)).toThrow(
      'Базовый пункт нельзя отключить',
    );
  });

  it('supports custom item lifecycle and excludes disabled items from a new snapshot', () => {
    const scheduled = enabledSchedule();
    const withItem = addCustomPreparationItem(scheduled, {
      id: 'custom-phone',
      groupId: 'personal',
      title: 'Поставить телефон на зарядку',
    });
    const disabled = setPreparationItemEnabled(withItem, 'custom-phone', false);
    const cycle = ensureNightCycle(disabled, {
      cycleDate: '2026-09-20',
      cycleId: 'night-1',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    });

    expect(cycle.cycle.preparationItems).toHaveLength(4);
    expect(cycle.cycle.preparationItems.some(({ id }) => id === 'custom-phone')).toBe(false);
    expect(deletePreparationItem(withItem, 'custom-phone').preparationItems).toHaveLength(4);
  });

  it('requires an explicit destination when deleting a nonempty group and moves its items', () => {
    const withGroup = addPreparationGroup(createEmptySleepSchedule(), {
      id: 'travel',
      title: 'Поездка',
    });
    const withItem = addCustomPreparationItem(withGroup, {
      id: 'custom-bag',
      groupId: 'travel',
      title: 'Подготовить сумку',
    });

    expect(() => deletePreparationGroup(withItem, 'travel')).toThrow(
      'Выберите группу для переноса пунктов',
    );
    const deleted = deletePreparationGroup(withItem, 'travel', 'personal');
    expect(deleted.preparationGroups.some(({ id }) => id === 'travel')).toBe(false);
    expect(deleted.preparationItems.find(({ id }) => id === 'custom-bag')?.groupId).toBe(
      'personal',
    );
  });

  it('moves a base item while keeping it protected', () => {
    const moved = movePreparationItem(createEmptySleepSchedule(), {
      itemId: 'base-room-air',
      targetGroupId: 'morning',
      targetPosition: 1,
    });

    expect(moved.preparationItems.find(({ id }) => id === 'base-room-air')).toMatchObject({
      groupId: 'morning',
      position: 1,
      kind: 'BASE',
    });
  });

  it('auto-completes when all active snapshot items are done and preserves its snapshot', () => {
    const state = enabledSchedule();
    const first = ensureNightCycle(state, {
      cycleDate: '2026-09-20',
      cycleId: 'night-1',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    });
    const editedCatalog = addCustomPreparationItem(first.state, {
      id: 'later-item',
      groupId: 'personal',
      title: 'Добавлено позже',
    });
    let current = editedCatalog;
    for (const item of first.cycle.preparationItems) {
      current = completePreparationItem(
        current,
        first.cycle.cycleDate,
        item.id,
        new Date('2026-09-20T13:00:00.000Z'),
      );
    }

    const cycle = current.nightCycles[0]!;
    expect(cycle.preparationItems).toHaveLength(4);
    expect(cycle.preparationItems.every(({ status }) => status === 'DONE')).toBe(true);
    expect(cycle.preparationCompletionKind).toBe('ALL_DONE');
    expect(cycle.preparationCompletedAt?.toISOString()).toBe('2026-09-20T13:00:00.000Z');
  });

  it.each([
    ['WITH_SKIPS', 'WITH_SKIPS'],
    ['SKIPPED_TODAY', 'SKIPPED_TODAY'],
  ] as const)('finishes preparation using %s', (input, expected) => {
    const first = ensureNightCycle(enabledSchedule(), {
      cycleDate: '2026-09-20',
      cycleId: 'night-1',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    });
    const finished = finishPreparation(
      first.state,
      '2026-09-20',
      input,
      new Date('2026-09-20T13:00:00.000Z'),
    );
    const cycle = finished.nightCycles[0]!;

    expect(cycle.preparationItems.every(({ status }) => status === 'SKIPPED')).toBe(true);
    expect(cycle.preparationCompletionKind).toBe(expected);
  });

  it('returns the same night across midnight and keeps its preparation snapshot', () => {
    const initial = enabledSchedule();
    const source = {
      id: 'prep-phone',
      groupId: 'environment',
      groupTitle: 'Среда',
      title: 'Убрать телефон',
      position: 1,
      status: 'PENDING' as const,
    };
    const first = ensureNightCycle(initial, {
      cycleDate: '2026-09-20',
      preparationItems: [source],
      cycleId: 'night-1',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    });

    source.title = 'Переименованный пункт';
    const reopened = ensureNightCycle(first.state, {
      cycleDate: '2026-09-20',
      preparationItems: [],
      cycleId: 'night-2',
      createdAt: new Date('2026-09-20T16:30:00.000Z'),
    });

    expect(reopened.cycle).toEqual(first.cycle);
    expect(reopened.state.nightCycles).toHaveLength(1);
    expect(reopened.cycle.preparationItems[0]?.title).toBe('Убрать телефон');
    expect(reopened.cycle.plannedWakeAt.toISOString()).toBe('2026-09-20T22:00:00.000Z');
  });

  it('cancels an obsolete future wake and creates the rescheduled occurrence', () => {
    const first = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });
    const changed = updateSleepSettings(
      first,
      { bedtime: '22:00', wakeTime: '08:00', timeZone: 'Asia/Chita', enabled: true },
      new Date('2026-09-20T12:05:00.000Z'),
    );

    const rebuilt = rebuildWakeSchedule(changed, {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:05:00.000Z'),
      nextId: ids('rescheduled'),
    });

    expect(
      rebuilt.wakeOccurrences.map(({ scheduledAt, status }) => [scheduledAt.toISOString(), status]),
    ).toEqual([
      ['2026-09-20T22:00:00.000Z', WAKE_OCCURRENCE_STATUS.cancelled],
      ['2026-09-20T23:00:00.000Z', WAKE_OCCURRENCE_STATUS.scheduled],
    ]);
  });

  it('reuses a matching scheduled occurrence without duplicates', () => {
    const first = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20', '2026-09-20'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });
    const second = rebuildWakeSchedule(first, {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:10:00.000Z'),
      nextId: ids('unused'),
    });

    expect(second.wakeOccurrences).toHaveLength(1);
    expect(second.wakeOccurrences[0]).toMatchObject({ id: 'wake-1', status: 'SCHEDULED' });
  });

  it('skips only the nearest future occurrence and records a one-time exception', () => {
    const scheduled = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20', '2026-09-21'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });

    const skipped = skipNearestWakeOccurrence(scheduled, {
      now: new Date('2026-09-20T12:30:00.000Z'),
      exceptionId: 'skip-1',
    });

    expect(skipped.wakeOccurrences.map(({ id, status }) => [id, status])).toEqual([
      ['wake-1', WAKE_OCCURRENCE_STATUS.skipped],
      ['wake-2', WAKE_OCCURRENCE_STATUS.scheduled],
    ]);
    expect(skipped.alarmExceptions).toEqual([
      {
        id: 'skip-1',
        occurrenceId: 'wake-1',
        kind: 'SKIP_ONCE',
        createdAt: new Date('2026-09-20T12:30:00.000Z'),
      },
    ]);
  });

  it('does not recreate a skipped occurrence during a later rebuild', () => {
    const scheduled = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20', '2026-09-21'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });
    const skipped = skipNearestWakeOccurrence(scheduled, {
      now: new Date('2026-09-20T12:30:00.000Z'),
      exceptionId: 'skip-1',
    });

    const rebuilt = rebuildWakeSchedule(skipped, {
      cycleDates: ['2026-09-20', '2026-09-21'],
      now: new Date('2026-09-20T13:00:00.000Z'),
      nextId: ids('duplicate'),
    });

    expect(rebuilt.wakeOccurrences.filter(({ cycleDate }) => cycleDate === '2026-09-20')).toEqual([
      expect.objectContaining({ id: 'wake-1', status: WAKE_OCCURRENCE_STATUS.skipped }),
    ]);
  });

  it('does not schedule the same cycle again after its wake was delivered', () => {
    const scheduled = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });
    const delivered = {
      ...scheduled,
      wakeOccurrences: scheduled.wakeOccurrences.map((occurrence) => ({
        ...occurrence,
        status: WAKE_OCCURRENCE_STATUS.delivered,
      })),
    };
    const changed = updateSleepSettings(
      delivered,
      { bedtime: '22:00', wakeTime: '08:00', timeZone: 'Asia/Chita', enabled: true },
      new Date('2026-09-20T12:05:00.000Z'),
    );

    const rebuilt = rebuildWakeSchedule(changed, {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:10:00.000Z'),
      nextId: ids('duplicate'),
    });

    expect(rebuilt.wakeOccurrences).toEqual([
      expect.objectContaining({ id: 'wake-1', status: WAKE_OCCURRENCE_STATUS.delivered }),
    ]);
  });

  it('does not create a backlog for a wake time at or before now', () => {
    const rebuilt = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-19', '2026-09-20'],
      now: new Date('2026-09-20T22:00:00.000Z'),
      nextId: ids('future'),
    });

    expect(rebuilt.wakeOccurrences).toEqual([]);
  });

  it('disables future wakes without deleting history and re-enables the same occurrence', () => {
    const scheduled = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });
    const disabled = setSleepFeatureEnabled(scheduled, false, new Date('2026-09-20T12:05:00.000Z'));
    const enabled = setSleepFeatureEnabled(disabled, true, new Date('2026-09-20T12:10:00.000Z'));
    const rebuilt = rebuildWakeSchedule(enabled, {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:10:00.000Z'),
      nextId: ids('unused'),
    });

    expect(disabled.wakeOccurrences[0]?.status).toBe(WAKE_OCCURRENCE_STATUS.cancelled);
    expect(rebuilt.wakeOccurrences).toHaveLength(1);
    expect(rebuilt.wakeOccurrences[0]).toMatchObject({ id: 'wake-1', status: 'SCHEDULED' });
  });

  it('cancels future wakes when settings are saved as disabled', () => {
    const scheduled = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });

    const disabled = updateSleepSettings(
      scheduled,
      { bedtime: '22:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: false },
      new Date('2026-09-20T12:05:00.000Z'),
    );

    expect(disabled.settings?.enabled).toBe(false);
    expect(disabled.wakeOccurrences[0]?.status).toBe(WAKE_OCCURRENCE_STATUS.cancelled);
  });

  it('imports native night events idempotently by their stable event id', () => {
    const state = enabledSchedule();
    const event = {
      id: 'REMINDER_60:2026-09-20',
      cycleDate: '2026-09-20',
      kind: 'REMINDER_60' as const,
      occurredAt: new Date('2026-09-20T11:00:00.000Z'),
    };

    const imported = importNativeSleepEvents(state, [event, event]);
    const repeated = importNativeSleepEvents(imported, [event]);

    expect(imported.sleepEvents).toEqual([event]);
    expect(repeated).toBe(imported);
  });

  it('replaces the provisional wake result with one trustworthy dismissal result', () => {
    const scheduled = rebuildWakeSchedule(enabledSchedule(), {
      cycleDates: ['2026-09-20'],
      now: new Date('2026-09-20T12:00:00.000Z'),
      nextId: ids('wake'),
    });
    const provisional = importNativeWakeResults(scheduled, [
      {
        id: 'wake:wake-1',
        occurrenceId: 'wake-1',
        cycleDate: '2026-09-20',
        kind: 'NO_RESULT',
        recordedAt: new Date('2026-09-20T22:00:00.000Z'),
        emergencyReason: null,
        emergencyComment: null,
        waterCompletedAt: null,
      },
    ]);
    const dismissed = importNativeWakeResults(provisional, [
      {
        id: 'wake:wake-1',
        occurrenceId: 'wake-1',
        cycleDate: '2026-09-20',
        kind: 'QR',
        recordedAt: new Date('2026-09-20T22:03:00.000Z'),
        emergencyReason: null,
        emergencyComment: null,
        waterCompletedAt: new Date('2026-09-20T22:04:00.000Z'),
      },
    ]);

    expect(dismissed.wakeResults).toHaveLength(1);
    expect(dismissed.wakeResults[0]).toMatchObject({ kind: 'QR' });
    expect(dismissed.wakeOccurrences[0]?.status).toBe(WAKE_OCCURRENCE_STATUS.delivered);
  });

  it('reports honest dismissal statistics and no QR share without a denominator', () => {
    const empty = summarizeSleepHistory(createEmptySleepSchedule());
    const withResults = summarizeSleepHistory({
      ...createEmptySleepSchedule(),
      wakeResults: [
        {
          id: 'wake:1',
          occurrenceId: 'wake-1',
          cycleDate: '2026-09-20',
          kind: 'QR',
          recordedAt: new Date('2026-09-20T22:00:00.000Z'),
          emergencyReason: null,
          emergencyComment: null,
          waterCompletedAt: new Date('2026-09-20T22:01:00.000Z'),
        },
        {
          id: 'wake:2',
          occurrenceId: 'wake-2',
          cycleDate: '2026-09-21',
          kind: 'EMERGENCY',
          recordedAt: new Date('2026-09-21T22:00:00.000Z'),
          emergencyReason: 'Недомогание',
          emergencyComment: null,
          waterCompletedAt: null,
        },
        {
          id: 'wake:3',
          occurrenceId: 'wake-3',
          cycleDate: '2026-09-22',
          kind: 'NO_RESULT',
          recordedAt: new Date('2026-09-22T22:00:00.000Z'),
          emergencyReason: null,
          emergencyComment: null,
          waterCompletedAt: null,
        },
      ],
      alarmExceptions: [
        {
          id: 'skip-1',
          occurrenceId: 'wake-4',
          kind: 'SKIP_ONCE',
          createdAt: new Date('2026-09-22T12:00:00.000Z'),
        },
      ],
    });

    expect(empty.qrShare).toBeNull();
    expect(withResults).toEqual({
      qrDismissals: 1,
      emergencyDismissals: 1,
      alarmDisabled: 1,
      withoutTrustworthyResult: 1,
      waterCompleted: 1,
      qrShare: 0.5,
    });
  });

  it('keeps an opened unfinished evening as no marks in history', () => {
    const opened = ensureNightCycle(enabledSchedule(), {
      cycleDate: '2026-09-20',
      cycleId: 'night-1',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    }).state;

    expect(selectSleepHistoryEntries(opened)).toEqual([
      expect.objectContaining({
        cycleDate: '2026-09-20',
        preparation: 'NO_MARKS',
        wakeResult: 'NO_RESULT',
      }),
    ]);
  });
});

function enabledSchedule() {
  return updateSleepSettings(
    createEmptySleepSchedule(),
    { bedtime: '22:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: true },
    new Date('2026-09-20T10:00:00.000Z'),
  );
}

function ids(prefix: string): () => string {
  let sequence = 0;
  return () => `${prefix}-${(sequence += 1)}`;
}
