import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsSnapshot } from '../ports/AnalyticsSnapshotReader';
import { GetAnalyticsOverview } from '../analytics/GetAnalyticsOverview';
import type { PlannerInbox } from '../planner/PlannerInbox';
import {
  completeDiaryEntry,
  createDiaryDraft,
  DayDate,
  diaryPeriod,
  EntityId,
  Goal,
  reviseDiaryEntry,
  Walk,
} from '../../domain';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { ReadAiContext } from './AiContext';
import {
  confirmSleepObservation,
  createWakeObservationDraft,
} from '../../domain/sleep/SleepObservation';

const base = {
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
function realAnalytics(snapshot: AnalyticsSnapshot, now = new Date(2026, 9, 5, 12)) {
  const storage = { read: async () => snapshot, subscribe: () => () => undefined };
  const inbox = { list: async () => [] } as unknown as Pick<PlannerInbox, 'list'>;
  return new ReadAiContext(storage, inbox, new GetAnalyticsOverview(storage, () => now));
}
function reader(snapshot: AnalyticsSnapshot) {
  const read = vi.fn().mockResolvedValue(snapshot);
  const inbox = { list: vi.fn().mockResolvedValue([]) } as unknown as Pick<PlannerInbox, 'list'>;
  const analytics = { execute: vi.fn() } as unknown as GetAnalyticsOverview;
  return {
    service: new ReadAiContext({ read, subscribe: () => () => undefined }, inbox, analytics),
    read,
  };
}

describe('AI context projection', () => {
  it('sends only confirmed sleep observations with bounded factual detail', async () => {
    const confirmed = confirmSleepObservation(null, {
      id: 'sleep-observation:2026-10-02',
      cycleDate: '2026-10-02',
      nightCycleId: 'night-2',
      wentToBedAt: new Date('2026-10-02T14:30:00.000Z'),
      wokeAt: new Date('2026-10-03T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      confirmedAt: new Date('2026-10-03T00:05:00.000Z'),
    });
    const draft = createWakeObservationDraft({
      id: 'sleep-observation:2026-10-03',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-3',
      wakeOccurrenceId: 'wake-secret',
      wakeKind: 'EMERGENCY',
      wokeAt: new Date('2026-10-04T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      now: new Date('2026-10-04T00:01:00.000Z'),
    });
    const result = await reader({ ...base, sleepObservations: [draft, confirmed] }).service.read({
      section: 'sleep',
      date: '2026-10-03',
    });
    const serialized = JSON.stringify(result);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.date).toBe('2026-10-02');
    expect(serialized).toContain('время в постели');
    expect(serialized).not.toMatch(/wake-secret|EMERGENCY|аварийн/iu);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(20_000);
  });
  it('limits a selected goal to its own allowed fields', async () => {
    const snapshot = {
      ...base,
      goals: [
        {
          id: { toString: () => 'goal-1' },
          title: 'Изучить язык',
          status: 'active',
          dueDate: '2026-12-01',
          description: 'Практика каждый день',
          deletedAt: null,
        },
        {
          id: { toString: () => 'goal-2' },
          title: 'Личная тайна',
          status: 'active',
          dueDate: null,
          description: 'Не относится к запросу',
          deletedAt: null,
        },
      ],
      diary: [{ payload: { note: 'Закрытая запись' } }],
    } as unknown as AnalyticsSnapshot;
    const result = await reader(snapshot).service.read({
      section: 'goals',
      date: '2026-10-03',
      selectedId: 'goal-1',
    });
    expect(result.sources).toEqual([
      {
        kind: 'goals',
        id: 'goal-1',
        title: 'Изучить язык',
        detail: 'Статус: active; срок: 2026-12-01; описание: Практика каждый день',
        date: '2026-12-01',
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/Личная тайна|Закрытая запись/);
  });

  it('omits deleted memories and photo data', async () => {
    const snapshot = {
      ...base,
      memory: [
        {
          id: { toString: () => 'event-1' },
          title: 'Путешествие',
          body: 'Рассказ',
          occurredOn: { toString: () => '2026-09-01' },
          deletedAt: null,
          photo: { dataUrl: 'private-image' },
        },
        {
          id: { toString: () => 'deleted' },
          title: 'Удалено',
          body: 'Секрет',
          occurredOn: { toString: () => '2026-09-02' },
          deletedAt: '2026-09-03',
        },
      ],
    } as unknown as AnalyticsSnapshot;
    const result = await reader(snapshot).service.read({ section: 'memory', date: '2026-10-03' });
    expect(result.sources).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/private-image|Удалено|Секрет/);
  });

  it('reads tomorrow without sending unrelated actions', async () => {
    const action = (id: string, date: string) => ({
      id: { toString: () => id },
      title: { toString: () => id },
      plannedDate: { toString: () => date },
      status: 'ready',
      deletedAt: null,
      archivedAt: null,
      estimateMinutes: 30,
      description: null,
    });
    const snapshot = {
      ...base,
      actions: [action('today', '2026-10-03'), action('tomorrow', '2026-10-04')],
    } as unknown as AnalyticsSnapshot;
    const result = await reader(snapshot).service.read({
      section: 'today',
      date: '2026-10-03',
      tomorrow: true,
    });
    expect(result.period).toEqual({ start: '2026-10-04', end: '2026-10-04' });
    expect(result.sources.map((item) => item.id)).toEqual(['tomorrow']);
  });

  it('does not read the private snapshot on the account page', async () => {
    const { service, read } = reader(base as AnalyticsSnapshot);
    const result = await service.read({ section: 'account', date: '2026-10-03' });
    expect(read).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
  });

  it('reports omitted records when a section exceeds the transmission budget', async () => {
    const snapshot = {
      ...base,
      memory: Array.from({ length: 80 }, (_, index) => ({
        id: { toString: () => `event-${index}` },
        title: `Событие ${index}`,
        body: 'Описание '.repeat(100),
        occurredOn: { toString: () => '2026-09-01' },
        deletedAt: null,
      })),
    } as unknown as AnalyticsSnapshot;
    const result = await reader(snapshot).service.read({ section: 'memory', date: '2026-10-03' });
    expect(result.sources.length).toBeLessThanOrEqual(24);
    expect(result.omittedCount).toBe(80 - result.sources.length);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(20_000);
  });

  it('connects completed walks with diary energy using the full period and numeric evidence only', async () => {
    const now = new Date(2026, 9, 5, 12);
    const dates = [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ];
    const diary = dates.map((date, index) => {
      const rating = index % 2 === 0 ? 4 : 2;
      const draft = createDiaryDraft(diaryPeriod('day', DayDate.create(date)), now);
      return completeDiaryEntry(
        reviseDiaryEntry(
          draft,
          {
            ...draft.payload,
            energy: rating,
            productivity: rating,
            mood: rating,
            overall: rating,
            energyReflection: 'Личный текст дневника',
          },
          now,
        ),
        now,
      );
    });
    const walks = dates
      .filter((_, index) => index % 2 === 0)
      .map((date, index) => {
        const startedAt = new Date(2026, 8, 28 + index * 2, 9);
        return Walk.create({
          id: EntityId.create(`walk-${index}`),
          date: DayDate.create(date),
          type: 'restorative',
          now: startedAt,
        })
          .start({ mode: 'stopwatch', startedAt })
          .complete({ endedAt: new Date(startedAt.getTime() + 30 * 60_000) })
          .reviseReflection({
            result: 'Личный текст прогулки',
            impact: null,
            afterState: null,
            updatedAt: new Date(startedAt.getTime() + 31 * 60_000),
          });
      });
    const result = await realAnalytics({ ...base, diary, walks }, now).read({
      section: 'analytics',
      date: '2026-09-28',
      period: 'week',
      topic: 'rest',
    });
    expect(result.period).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(result.facts[0]).toBe('Тема аналитики: отдых и прогулки');
    expect(result.facts.join(' ')).toMatch(/прогулк[а-я]*.*3.*4.*без прогулк[а-я]*.*3.*2/i);
    expect(result.sources.some((item) => item.kind === 'walks')).toBe(true);
    expect(result.sources.some((item) => item.kind === 'diary')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/Личный текст/);
  });

  it('marks small groups as insufficient and prioritizes the selected topic without crowding out related records', async () => {
    const now = new Date(2026, 9, 5, 12);
    const date = '2026-10-02';
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create(date)), now);
    const diary = [
      completeDiaryEntry(
        reviseDiaryEntry(
          draft,
          {
            ...draft.payload,
            energy: 5,
            productivity: 5,
            mood: 5,
            overall: 5,
            note: 'Личная заметка',
          },
          now,
        ),
        now,
      ),
    ];
    const walk = Walk.create({
      id: EntityId.create('walk-small'),
      date: DayDate.create(date),
      type: 'restorative',
      now,
    })
      .start({ mode: 'stopwatch', startedAt: now })
      .complete({ endedAt: new Date(now.getTime() + 10 * 60_000), result: 'Личный результат' });
    const result = await realAnalytics({ ...base, diary, walks: [walk] }, now).read({
      section: 'analytics',
      date,
      period: 'week',
      topic: 'rest',
    });
    expect(result.facts.join(' ')).toMatch(/с прогулкой: 1; без прогулки: 0.*недостаточно данных/i);
    expect(result.facts.join(' ')).not.toMatch(/средняя энергия 5.*без прогулки/i);
    expect(result.sources.map((item) => item.kind).slice(0, 2)).toEqual(['walks', 'diary']);
    expect(JSON.stringify(result)).not.toMatch(/Личная заметка|Личный результат/);
  });

  it('keeps linked diary evidence when a topic has more records than the source budget', async () => {
    const now = new Date(2026, 9, 5, 12);
    const date = '2026-10-02';
    const draft = createDiaryDraft(diaryPeriod('day', DayDate.create(date)), now);
    const diary = [
      completeDiaryEntry(
        reviseDiaryEntry(
          draft,
          {
            ...draft.payload,
            energy: 3,
            productivity: 3,
            mood: 3,
            overall: 3,
          },
          now,
        ),
        now,
      ),
    ];
    const memory = Array.from({ length: 40 }, (_, index) => ({
      id: EntityId.create(`memory-${index}`),
      title: `Событие ${index}`,
      occurredOn: DayDate.create(date),
      deletedAt: null,
      body: 'Скрытое описание',
      photo: { dataUrl: 'private-image' },
    }));
    const result = await realAnalytics(
      { ...base, diary, memory } as unknown as AnalyticsSnapshot,
      now,
    ).read({
      section: 'analytics',
      date,
      period: 'week',
      topic: 'memory',
    });
    expect(result.sources[0]?.kind).toBe('memory');
    expect(result.sources.some((item) => item.kind === 'diary')).toBe(true);
    expect(result.sources).toHaveLength(24);
    expect(result.omittedCount).toBe(17);
    expect(JSON.stringify(result)).not.toMatch(/Скрытое описание|private-image/);
  });

  it('names the goal linked by an effective action contribution', async () => {
    const now = new Date(2026, 9, 5, 12);
    const completedAt = new Date(2026, 9, 2, 11);
    const goal = Goal.create({
      id: EntityId.create('goal-learning'),
      title: 'Изучать язык',
      status: 'active',
      now,
    });
    const action = createReadyLifeAction('practice', DayDate.create('2026-10-02'));
    action.markInProgress(new Date(2026, 9, 2, 10), EntityId.create('start-practice'));
    action.complete(null, completedAt, EntityId.create('complete-practice'));
    const contribution: ProgressContribution = {
      id: 'fact-practice',
      goalId: goal.id.toString(),
      actionId: action.id.toString(),
      completionKey: action.completionKey,
      linkId: null,
      source: 'completion',
      amount: 1,
      effectiveDate: '2026-10-02',
      occurredAt: completedAt.toISOString(),
      updatedAt: completedAt.toISOString(),
      voided: false,
      reason: 'Практика',
      version: 1,
      schemaVersion: 1,
    };
    const result = await realAnalytics(
      {
        ...base,
        goals: [goal],
        actions: [action],
        contributions: [contribution],
      },
      now,
    ).read({ section: 'analytics', date: '2026-10-02', period: 'week', topic: 'goals' });
    expect(result.sources.find((item) => item.kind === 'actions')?.detail).toContain(
      'Подтверждённый вклад в цели: Изучать язык',
    );
    expect(result.sources.find((item) => item.kind === 'goals')?.detail).toContain(
      'Вкладов за период: 1',
    );
  });
});
