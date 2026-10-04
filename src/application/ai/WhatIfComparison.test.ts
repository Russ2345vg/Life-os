import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import {
  createReadyLifeAction,
  completeLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import type { AnalyticsSnapshot } from '../ports/AnalyticsSnapshotReader';
import { createEmptySleepSchedule } from '../../domain/sleep/SleepSchedule';
import { compareWhatIf } from './WhatIfComparison';

const now = new Date('2026-10-03T11:00:00.000Z'); // 20:00 in Asia/Chita
const date = '2026-10-03';
const timeZone = 'Asia/Chita';
const options = [
  { title: 'Поиграть', durationMinutes: 60 },
  { title: 'Сделать задачу', durationMinutes: 25 },
] as const;
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

describe('what-if comparison', () => {
  it('compares both options from the same current time without choosing or writing', () => {
    const action = createReadyLifeAction('planned', DayDate.create(date));
    action.setTimePlanning({
      estimateMinutes: 30,
      scheduledStartMinute: 20 * 60 + 30,
      scheduledDurationMinutes: 30,
    });
    const unknown = createReadyLifeAction('unknown', DayDate.create(date));
    const done = completeLifeAction(createReadyLifeAction('done', DayDate.create(date)));
    const snapshot = { ...empty, actions: [action, unknown, done] };
    const before = snapshot.actions.map((item) => [
      item.status,
      item.plannedDate?.toString(),
      item.estimateMinutes,
    ]);
    const result = compareWhatIf({ date, now, timeZone, options }, snapshot);

    expect(result.plan).toMatchObject({
      actionCount: 2,
      knownMinutes: 30,
      unknownEstimateCount: 1,
    });
    expect(result.options).toMatchObject([
      { title: 'Поиграть', durationMinutes: 60, overlappingActionCount: 1 },
      { title: 'Сделать задачу', durationMinutes: 25, overlappingActionCount: 0 },
    ]);
    expect(result.context.sources.map((item) => item.id)).toEqual(['planned', 'unknown']);
    expect(JSON.stringify(result)).not.toMatch(/done|winner|recommendation/);
    expect(
      snapshot.actions.map((item) => [
        item.status,
        item.plannedDate?.toString(),
        item.estimateMinutes,
      ]),
    ).toEqual(before);
  });

  it('reports an unknown sleep boundary when sleep is not configured', () => {
    const result = compareWhatIf({ date, now, timeZone, options }, empty);
    expect(result.nextSleepAt).toBeNull();
    expect(result.options.map((item) => item.sleepOverrunMinutes)).toEqual([null, null]);
    expect(result.context.facts.join(' ')).toContain('Сон не настроен');
    expect(result.context.section).toBe('today');
  });

  it('shows a bedtime crossing without treating it as a decision', () => {
    const sleep = {
      ...createEmptySleepSchedule(),
      settings: {
        bedtime: '20:40',
        wakeTime: '07:00',
        timeZone: 'Asia/Chita',
        enabled: true,
        quietModeEnabled: false,
        alarmSound: { uri: null, title: 'Системный сигнал' },
        version: 1,
        updatedAt: now,
      },
    };
    const result = compareWhatIf({ date, now, timeZone, options }, { ...empty, sleep });
    expect(result.options.map((item) => item.sleepOverrunMinutes)).toEqual([20, 0]);
    expect(result.nextSleepAt).toBe('2026-10-03T11:40:00.000Z');
  });

  it('bounds user input and excludes unrelated private records from AI context', () => {
    expect(() =>
      compareWhatIf(
        { date, now, timeZone, options: [{ title: '', durationMinutes: 60 }, options[1]] },
        empty,
      ),
    ).toThrow();
    expect(() =>
      compareWhatIf(
        { date, now, timeZone, options: [{ title: 'А', durationMinutes: 721 }, options[1]] },
        empty,
      ),
    ).toThrow();
    const snapshot = {
      ...empty,
      diary: [{ payload: { secret: 'private-diary' } }],
    } as unknown as AnalyticsSnapshot;
    const result = compareWhatIf({ date, now, timeZone, options }, snapshot);
    expect(JSON.stringify(result.context)).not.toContain('private-diary');
    expect(result.context.sources).toEqual([]);
  });

  it('keeps a permitted long option title intact in the AI preview', () => {
    const title = 'П'.repeat(120);
    const result = compareWhatIf(
      { date, now, timeZone, options: [{ title, durationMinutes: 60 }, options[1]] },
      empty,
    );
    expect(result.context.facts.some((fact) => fact.includes(title))).toBe(true);
    expect(result.context.facts.every((fact) => fact.length <= 180)).toBe(true);
  });
});
