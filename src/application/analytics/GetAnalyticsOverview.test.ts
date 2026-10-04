import { describe, expect, it } from 'vitest';
import {
  ActionSession,
  completeDiaryEntry,
  createDiaryDraft,
  DayDate,
  diaryPeriod,
  EntityId,
  Goal,
  reviseDiaryEntry,
} from '../../domain';
import type { AnalyticsSnapshot } from '../ports/AnalyticsSnapshotReader';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { buildAnalyticsOverview, resolveAnalyticsPeriod } from './GetAnalyticsOverview';
import {
  confirmSleepObservation,
  createWakeObservationDraft,
} from '../../domain/sleep/SleepObservation';

const at = new Date(2026, 8, 29, 12);
const empty: AnalyticsSnapshot = {
  actions: [],
  sessions: [],
  goals: [],
  contributions: [],
  diary: [],
  balance: [],
  walks: [],
  memory: [],
  sleep: null,
  sleepObservations: [],
  spheres: [],
  directions: [],
};
const period = resolveAnalyticsPeriod('week', '2026-09-21', '2026-09-29');

describe('analytics overview', () => {
  it('defaults to the last full week, uses calendar months and compares only completed days', () => {
    expect(resolveAnalyticsPeriod('week', undefined, '2026-09-29')).toMatchObject({
      start: '2026-09-21',
      end: '2026-09-27',
      previousStart: '2026-09-14',
    });
    expect(resolveAnalyticsPeriod('month', '2026-09-21', '2026-09-29')).toMatchObject({
      start: '2026-09-01',
      end: '2026-09-30',
      previousStart: '2026-08-01',
      previousEnd: '2026-08-31',
      comparisonCurrentEnd: '2026-09-28',
      comparisonPreviousEnd: '2026-08-28',
    });
    expect(resolveAnalyticsPeriod('week', '2026-09-28', '2026-09-29').comparisonCurrentEnd).toBe(
      '2026-09-28',
    );
    expect(resolveAnalyticsPeriod('month', '2026-09-01', '2026-10-02')).toMatchObject({
      comparisonCurrentEnd: '2026-09-30',
      comparisonPreviousEnd: '2026-08-31',
    });
    expect(resolveAnalyticsPeriod('week', 'bad', '2026-09-29').start).toBe('2026-09-21');
  });

  it('keeps archive, removes reopened completion and counts distinct goals with known effective contributions', () => {
    const goal = Goal.create({
      id: EntityId.create('goal'),
      title: 'Цель',
      status: 'active',
      now: at,
    });
    const archived = createReadyLifeAction('archived', DayDate.create('2026-09-25'));
    archived.markInProgress(new Date(2026, 8, 25, 10), EntityId.create('start'));
    archived.complete(null, new Date(2026, 8, 25, 11), EntityId.create('finish'));
    archived.archive(new Date(2026, 8, 25, 12), EntityId.create('archive'));
    const reopened = createReadyLifeAction('reopened', DayDate.create('2026-09-25'));
    reopened.markInProgress(new Date(2026, 8, 25, 10), EntityId.create('start-reopen'));
    reopened.complete(null, new Date(2026, 8, 25, 11), EntityId.create('finish-reopen'));
    const oldKey = reopened.completionKey;
    reopened.reopen(new Date(2026, 8, 26, 9));
    const fact = (
      id: string,
      amount: number | null,
      actionId: string | null,
      completionKey: string | null,
    ): ProgressContribution => ({
      id,
      goalId: 'goal',
      actionId,
      completionKey,
      linkId: null,
      source: actionId ? 'completion' : 'manual',
      amount,
      effectiveDate: '2026-09-25',
      occurredAt: at.toISOString(),
      updatedAt: at.toISOString(),
      voided: false,
      reason: 'Вклад',
      version: 1,
      schemaVersion: 1,
    });
    const overview = buildAnalyticsOverview(
      {
        ...empty,
        goals: [goal],
        actions: [archived, reopened],
        contributions: [
          fact('valid', 0, 'archived', archived.completionKey),
          fact('old', 4, 'reopened', oldKey),
          fact('pending', null, null, null),
        ],
      },
      period,
      at,
    );
    expect(overview.completedCount).toBe(1);
    expect(overview.goalsWithContribution).toBe(1);
    expect(overview.goalRows[0]).toMatchObject({ knownAmount: 0, pending: 1 });
    expect(overview.goalRows[0]?.contributions.map((item) => item.id)).toEqual([
      'valid',
      'pending',
    ]);
  });

  it('separates absent diary rating from zero actions and leaves unavailable comparisons blank', () => {
    const overview = buildAnalyticsOverview(empty, period, at);
    expect(overview.completedCount).toBe(0);
    expect(overview.energy).toBeNull();
    expect(overview.energySamples).toBe(0);
    expect(overview.comparison.energyDifference).toBeNull();
    expect(overview.balance).toEqual([]);
    expect(overview.preparation.allDone).toBe(0);
  });

  it('summarizes only confirmed sleep observations in the selected period', () => {
    const confirmed = confirmSleepObservation(null, {
      id: 'sleep-observation:2026-09-25',
      cycleDate: '2026-09-25',
      nightCycleId: 'night-25',
      wentToBedAt: new Date('2026-09-25T14:30:00.000Z'),
      wokeAt: new Date('2026-09-26T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      confirmedAt: new Date('2026-09-26T00:05:00.000Z'),
    });
    const draft = createWakeObservationDraft({
      id: 'sleep-observation:2026-09-26',
      cycleDate: '2026-09-26',
      nightCycleId: 'night-26',
      wakeOccurrenceId: 'wake-26',
      wakeKind: 'EMERGENCY',
      wokeAt: new Date('2026-09-27T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      now: new Date('2026-09-27T00:01:00.000Z'),
    });

    const overview = buildAnalyticsOverview(
      { ...empty, sleepObservations: [confirmed, draft] },
      period,
      at,
    );

    expect(overview.sleep).toMatchObject({
      confirmedCount: 1,
      incompleteCount: 1,
      averageTimeInBedMinutes: 570,
    });
  });

  it('shows only dated monthly balance snapshots overlapping a cross-month week', () => {
    const snapshot = (month: string) => ({
      id: `monthly:sphere:sphere:${month}`,
      entityType: 'sphere' as const,
      entityId: 'sphere',
      month,
      automaticScore: null,
      manualScore: 6,
      effectiveScore: 6,
      desiredLevel: null,
      attentionNeed: null,
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      version: 1,
      schemaVersion: 1 as const,
    });
    const current = resolveAnalyticsPeriod('week', '2026-09-28', '2026-10-02');
    const report = buildAnalyticsOverview(
      { ...empty, balance: [snapshot('2026-09'), snapshot('2026-10'), snapshot('2026-11')] },
      current,
      new Date(2026, 9, 2, 12),
    );
    expect(report.balance.map((item) => item.month)).toEqual(['2026-09', '2026-10']);
  });

  it('keeps daily evidence aligned with a paused overnight session and counts diary samples separately', () => {
    const work = ActionSession.start({
      id: EntityId.create('session'),
      lifeActionId: EntityId.create('missing-action'),
      goalIdAtStart: null,
      startedAt: new Date(2026, 8, 28, 23, 30),
      eventId: EntityId.create('start-session'),
    });
    work.pause(new Date(2026, 8, 28, 23, 50), EntityId.create('pause-session'));
    work.resume(new Date(2026, 8, 29, 0, 10), EntityId.create('resume-session'));
    work.complete({
      completedAt: new Date(2026, 8, 29, 0, 40),
      completionKind: 'completed',
      eventId: EntityId.create('finish-session'),
    });
    const rated = (date: string, energy: 2 | 4) => {
      const draft = createDiaryDraft(diaryPeriod('day', DayDate.create(date)), at);
      return completeDiaryEntry(
        reviseDiaryEntry(
          draft,
          { ...draft.payload, energy, productivity: energy, mood: energy, overall: energy },
          at,
        ),
        at,
      );
    };
    const current = resolveAnalyticsPeriod('week', '2026-09-28', '2026-09-29');
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-28')), at);
    const report = buildAnalyticsOverview(
      {
        ...empty,
        sessions: [work],
        diary: [rated('2026-09-28', 2), rated('2026-09-29', 4), draft],
      },
      current,
      at,
    );
    expect(report.timeMilliseconds).toBe(50 * 60_000);
    expect(report.days.map((day) => day.timeMilliseconds)).toEqual([20 * 60_000, 30 * 60_000]);
    expect(report.timeEvidence.map((day) => day.rows[0]?.title)).toEqual([
      'Действие недоступно',
      'Действие недоступно',
    ]);
    expect(report.energy).toBe(3);
    expect(report.energySamples).toBe(2);
    expect(report.completedDiaryDays).toBe(2);
  });
});
