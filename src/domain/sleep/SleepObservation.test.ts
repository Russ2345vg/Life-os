import { describe, expect, it } from 'vitest';
import {
  confirmSleepObservation,
  createWakeObservationDraft,
  recordManualSleepDraft,
  isConfirmedSleepObservation,
  reviseSleepObservation,
  summarizeSleepObservations,
  timeInBedMilliseconds,
  setSleepMorningFeedback,
  clearSleepMorningFeedback,
} from './SleepObservation';

const createdAt = new Date('2026-10-03T21:00:00.000Z');

describe('Sleep observation', () => {
  const feedbackInput = {
    id: 'sleep-observation:2026-10-10',
    cycleDate: '2026-10-10',
    nightCycleId: null,
    timeZone: 'Asia/Chita',
    patch: { sleepQuality: 'GOOD' as const },
    now: new Date('2026-10-11T01:00:00Z'),
  };
  it('keeps partial morning feedback independent without inventing sleep times', () => {
    const first = setSleepMorningFeedback(null, feedbackInput);
    const second = setSleepMorningFeedback(first, {
      ...feedbackInput,
      patch: { energy: 'TIRED' },
      now: new Date('2026-10-11T01:01:00Z'),
    });
    expect(second).toMatchObject({
      id: 'sleep-observation:2026-10-10',
      wentToBedAt: null,
      wokeAt: null,
      wakeSource: null,
      confirmedAt: null,
      createdAt: feedbackInput.now,
      morningFeedback: { sleepQuality: 'GOOD', energy: 'TIRED' },
    });
    expect(summarizeSleepObservations([second])).toMatchObject({
      confirmedCount: 0,
      averageTimeInBedMinutes: null,
      averageBedtimeMinute: null,
    });
    expect(isConfirmedSleepObservation(second)).toBe(false);
  });
  it('rejects an empty patch even when feedback already exists', () => {
    const first = setSleepMorningFeedback(null, feedbackInput);
    expect(() => setSleepMorningFeedback(first, { ...feedbackInput, patch: {} })).toThrow();
  });
  it('guards future wake dates using the observation timezone', () => {
    const input = { ...feedbackInput, now: new Date('2026-10-10T20:00:00Z') };
    expect(() =>
      setSleepMorningFeedback(null, { ...input, timeZone: 'America/Los_Angeles' }),
    ).toThrow('будущ');
    expect(
      setSleepMorningFeedback(null, { ...input, timeZone: 'Pacific/Kiritimati' }).cycleDate,
    ).toBe('2026-10-10');
  });
  it('preserves feedback through manual marks, confirmation and revision', () => {
    const rated = setSleepMorningFeedback(null, feedbackInput);
    const bed = recordManualSleepDraft(rated, {
      ...feedbackInput,
      kind: 'BEDTIME',
      recordedAt: new Date('2026-10-10T14:00:00Z'),
    });
    const wake = recordManualSleepDraft(bed, {
      ...feedbackInput,
      kind: 'WAKE',
      recordedAt: new Date('2026-10-10T21:00:00Z'),
    });
    expect(bed.morningFeedback).toEqual(rated.morningFeedback);
    expect(wake.morningFeedback).toEqual(rated.morningFeedback);
    const confirmed = confirmSleepObservation(wake, {
      ...feedbackInput,
      wentToBedAt: bed.wentToBedAt!,
      wokeAt: wake.wokeAt!,
      confirmedAt: feedbackInput.now,
    });
    const revised = reviseSleepObservation(confirmed, {
      wentToBedAt: new Date('2026-10-10T14:10:00Z'),
      wokeAt: wake.wokeAt!,
      updatedAt: new Date('2026-10-11T01:02:00Z'),
    });
    expect(confirmed.morningFeedback).toEqual(rated.morningFeedback);
    expect(revised.morningFeedback).toEqual(rated.morningFeedback);
    const cleared = clearSleepMorningFeedback(revised, new Date('2026-10-11T01:03:00Z'));
    expect(cleared).not.toHaveProperty('morningFeedback');
    expect(cleared).toMatchObject({
      id: revised.id,
      createdAt: rated.createdAt,
      wentToBedAt: revised.wentToBedAt,
      wokeAt: revised.wokeAt,
      confirmedAt: revised.confirmedAt,
    });
  });
  it('keeps both manual stamps as an editable draft and preserves the first tap', () => {
    const input = {
      id: 'manual',
      cycleDate: '2026-10-03',
      nightCycleId: null,
      timeZone: 'Asia/Chita',
      kind: 'BEDTIME' as const,
      recordedAt: new Date('2026-10-03T14:30:00Z'),
      now: new Date('2026-10-03T14:30:00Z'),
    };
    const bed = recordManualSleepDraft(null, input);
    expect(
      recordManualSleepDraft(bed, { ...input, recordedAt: new Date('2026-10-03T15:00:00Z') }),
    ).toBe(bed);
    const wake = recordManualSleepDraft(bed, {
      ...input,
      kind: 'WAKE',
      recordedAt: new Date('2026-10-04T00:30:00Z'),
      now: new Date('2026-10-04T00:30:00Z'),
    });
    expect(wake).toMatchObject({
      wentToBedAt: input.recordedAt,
      wakeSource: 'MANUAL',
      confirmedAt: null,
    });
    expect(summarizeSleepObservations([wake]).confirmedCount).toBe(0);
    expect(() => recordManualSleepDraft(bed, { ...input, kind: 'WAKE' })).toThrow('раньше');
  });
  it('creates one incomplete draft from a trustworthy alarm result', () => {
    const draft = createWakeObservationDraft({
      id: 'observation-1',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wakeOccurrenceId: 'wake-1',
      wakeKind: 'QR',
      wokeAt: new Date('2026-10-04T00:12:00.000Z'),
      timeZone: 'Asia/Chita',
      now: createdAt,
    });

    expect(draft).toEqual({
      id: 'observation-1',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wentToBedAt: null,
      wokeAt: new Date('2026-10-04T00:12:00.000Z'),
      wakeSource: 'ALARM_QR',
      wakeOccurrenceId: 'wake-1',
      timeZone: 'Asia/Chita',
      confirmedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    expect(isConfirmedSleepObservation(draft)).toBe(false);
  });

  it('rejects NO_RESULT as an observation source', () => {
    expect(() =>
      createWakeObservationDraft({
        id: 'observation-1',
        cycleDate: '2026-10-03',
        nightCycleId: null,
        wakeOccurrenceId: 'wake-1',
        wakeKind: 'NO_RESULT',
        wokeAt: new Date('2026-10-04T00:12:00.000Z'),
        timeZone: 'Asia/Chita',
        now: createdAt,
      }),
    ).toThrow('отключения будильника');
  });

  it('confirms a cross-midnight night and reports time in bed', () => {
    const confirmed = confirmSleepObservation(null, {
      id: 'observation-1',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wentToBedAt: new Date('2026-10-03T14:30:00.000Z'),
      wokeAt: new Date('2026-10-04T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      confirmedAt: new Date('2026-10-04T00:05:00.000Z'),
    });

    expect(confirmed.wakeSource).toBe('MANUAL');
    expect(isConfirmedSleepObservation(confirmed)).toBe(true);
    expect(timeInBedMilliseconds(confirmed)).toBe(9.5 * 60 * 60 * 1000);
  });

  it('keeps the explicit cycle date when wake time is later than planned', () => {
    const draft = createWakeObservationDraft({
      id: 'observation-1',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wakeOccurrenceId: 'wake-1',
      wakeKind: 'EMERGENCY',
      wokeAt: new Date('2026-10-04T03:30:00.000Z'),
      timeZone: 'Asia/Chita',
      now: new Date('2026-10-04T03:31:00.000Z'),
    });

    expect(draft.cycleDate).toBe('2026-10-03');
    expect(draft.wakeSource).toBe('ALARM_EMERGENCY');
  });

  it('rejects wentToBedAt at or after wokeAt', () => {
    expect(() =>
      confirmSleepObservation(null, {
        id: 'observation-1',
        cycleDate: '2026-10-03',
        nightCycleId: null,
        wentToBedAt: new Date('2026-10-04T00:00:00.000Z'),
        wokeAt: new Date('2026-10-04T00:00:00.000Z'),
        timeZone: 'Asia/Chita',
        confirmedAt: new Date('2026-10-04T00:05:00.000Z'),
      }),
    ).toThrow('раньше времени подъёма');
  });

  it('marks an edited alarm wake time as manual while preserving its occurrence link', () => {
    const draft = createWakeObservationDraft({
      id: 'observation-1',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wakeOccurrenceId: 'wake-1',
      wakeKind: 'QR',
      wokeAt: new Date('2026-10-04T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      now: createdAt,
    });
    const confirmed = confirmSleepObservation(draft, {
      id: 'ignored-for-existing',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wentToBedAt: new Date('2026-10-03T14:30:00.000Z'),
      wokeAt: new Date('2026-10-04T00:45:00.000Z'),
      timeZone: 'Asia/Chita',
      confirmedAt: new Date('2026-10-04T00:50:00.000Z'),
    });

    expect(confirmed).toMatchObject({
      id: 'observation-1',
      wakeSource: 'MANUAL',
      wakeOccurrenceId: 'wake-1',
      createdAt,
    });
  });

  it('revises a confirmed night without changing its identity', () => {
    const confirmed = confirmSleepObservation(null, {
      id: 'observation-1',
      cycleDate: '2026-10-03',
      nightCycleId: null,
      wentToBedAt: new Date('2026-10-03T14:30:00.000Z'),
      wokeAt: new Date('2026-10-04T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      confirmedAt: new Date('2026-10-04T00:05:00.000Z'),
    });
    const revised = reviseSleepObservation(confirmed, {
      wentToBedAt: new Date('2026-10-03T15:00:00.000Z'),
      wokeAt: new Date('2026-10-04T00:15:00.000Z'),
      updatedAt: new Date('2026-10-04T01:00:00.000Z'),
    });

    expect(revised).toMatchObject({
      id: 'observation-1',
      wakeSource: 'MANUAL',
      wakeOccurrenceId: null,
      confirmedAt: new Date('2026-10-04T01:00:00.000Z'),
      createdAt: new Date('2026-10-04T00:05:00.000Z'),
    });
  });

  it('summarizes only confirmed complete observations and handles DST timestamps', () => {
    const first = confirmSleepObservation(null, {
      id: 'observation-1',
      cycleDate: '2026-03-07',
      nightCycleId: null,
      wentToBedAt: new Date('2026-03-08T04:00:00.000Z'),
      wokeAt: new Date('2026-03-08T12:00:00.000Z'),
      timeZone: 'America/New_York',
      confirmedAt: new Date('2026-03-08T12:05:00.000Z'),
    });
    const second = confirmSleepObservation(null, {
      id: 'observation-2',
      cycleDate: '2026-03-08',
      nightCycleId: null,
      wentToBedAt: new Date('2026-03-09T03:30:00.000Z'),
      wokeAt: new Date('2026-03-09T11:30:00.000Z'),
      timeZone: 'America/New_York',
      confirmedAt: new Date('2026-03-09T11:35:00.000Z'),
    });
    const incomplete = createWakeObservationDraft({
      id: 'observation-3',
      cycleDate: '2026-03-09',
      nightCycleId: null,
      wakeOccurrenceId: 'wake-3',
      wakeKind: 'QR',
      wokeAt: new Date('2026-03-10T11:00:00.000Z'),
      timeZone: 'America/New_York',
      now: new Date('2026-03-10T11:01:00.000Z'),
    });

    expect(summarizeSleepObservations([first, second, incomplete])).toEqual({
      confirmedCount: 2,
      incompleteCount: 1,
      averageTimeInBedMinutes: 480,
      averageBedtimeMinute: 1395,
      averageWakeMinute: 465,
      bedtimeVariabilityMinutes: 15,
      wakeVariabilityMinutes: 15,
    });
  });
});
