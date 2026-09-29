import { describe, expect, it } from 'vitest';
import type { DiaryRepository, PlanningRepository, PlanningState } from '..';
import { DayDate, type DiaryEntry, type DiaryPeriodKind } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { FakeClock, FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { DiaryApplicationService } from './DiaryService';

describe('DiaryApplicationService', () => {
  it('creates, edits and completes one versioned entry per period', async () => {
    const repository = new MemoryDiaryRepository();
    const service = createService(repository);
    const first = await service.saveDraft(dayInput(null, { worldBetter: '  Помог соседу  ' }));
    expect(first).toMatchObject({
      id: { value: 'diary:day:2026-09-29' },
      version: 1,
      status: 'draft',
    });
    if (first.kind !== 'day') throw new Error('Expected a day diary entry.');
    expect(first.payload.worldBetter).toBe('Помог соседу');
    const edited = await service.saveDraft(dayInput(1, { note: 'Новая заметка' }));
    expect(edited).toMatchObject({ version: 2, status: 'draft' });
    const completed = await service.complete(dayInput(2));
    expect(completed).toMatchObject({ version: 3, status: 'completed' });
    const reopened = await service.saveDraft(dayInput(3, { note: 'Уточнение' }));
    expect(reopened).toMatchObject({ version: 4, status: 'draft' });
    expect((await service.complete(dayInput(4))).status).toBe('completed');
  });

  it('propagates stale conflicts and can retry the same input after a transient failure', async () => {
    const repository = new MemoryDiaryRepository();
    const service = createService(repository);
    await service.saveDraft(dayInput(null));
    await expect(service.saveDraft(dayInput(null))).rejects.toMatchObject({
      code: 'persistence.version_conflict',
    });
    repository.failNext = true;
    await expect(service.saveDraft(dayInput(1, { note: 'Не терять' }))).rejects.toThrow('offline');
    await expect(service.saveDraft(dayInput(1, { note: 'Не терять' }))).resolves.toMatchObject({
      version: 2,
    });
  });

  it('rejects future periods and reads deterministic weekly/monthly overviews', async () => {
    const repository = new MemoryDiaryRepository();
    const service = createService(repository);
    await expect(service.get('day', DayDate.create('2026-09-30'))).rejects.toMatchObject({
      code: 'diary.future_period',
    });
    await expect(service.getWeekOverview(DayDate.create('2026-09-21'))).resolves.toMatchObject({
      period: { periodKey: 'week:2026-09-21' },
      summary: { completedDays: 0, totalDays: 7 },
    });
    await expect(service.getMonthOverview(DayDate.create('2026-09-01'))).resolves.toMatchObject({
      period: { periodKey: 'month:2026-09-01' },
      summary: { completedDays: 0, totalDays: 30 },
    });
  });
});

function dayInput(expectedVersion: number | null, changes: Record<string, string> = {}) {
  return {
    kind: 'day' as const,
    anchor: DayDate.create('2026-09-29'),
    expectedVersion,
    payload: {
      productivity: 4 as const,
      energy: 3 as const,
      mood: 5 as const,
      overall: 4 as const,
      worldBetter: null,
      energyReflection: null,
      tomorrowReflection: null,
      note: null,
      ...changes,
    },
  };
}

function createService(repository: DiaryRepository) {
  return new DiaryApplicationService(
    repository,
    new FakeClock(new Date('2026-09-29T20:00:00.000Z')),
    new FakeCurrentDateProvider(DayDate.create('2026-09-29')),
    new EmptyPlanningRepository(),
  );
}

class MemoryDiaryRepository implements DiaryRepository {
  readonly records = new Map<string, DiaryEntry>();
  failNext = false;
  async findByPeriodKey(periodKey: string) {
    return this.records.get(periodKey) ?? null;
  }
  async listCompleted(kind: DiaryPeriodKind, start: DayDate, end: DayDate) {
    return [...this.records.values()].filter(
      (entry) =>
        entry.kind === kind &&
        entry.status === 'completed' &&
        !entry.periodStart.isBefore(start) &&
        !entry.periodStart.isAfter(end),
    );
  }
  async save(entry: DiaryEntry, expectedVersion: number | null) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('offline');
    }
    const current = this.records.get(entry.periodKey);
    if ((current?.version ?? null) !== expectedVersion)
      throw new DomainError('persistence.version_conflict', 'conflict');
    const saved = { ...entry, version: (expectedVersion ?? 0) + 1 } as DiaryEntry;
    this.records.set(entry.periodKey, saved);
    return saved;
  }
}

class EmptyPlanningRepository implements PlanningRepository {
  readonly value: PlanningState = {
    goals: [],
    actions: [],
    periods: [],
    memberships: [],
    decisions: [],
    links: [],
    contributions: [],
    rules: [],
    legacyFocus: [],
    journal: [],
  };
  async read() {
    return this.value;
  }
  async change<T>(work: (state: PlanningState) => T) {
    return work(this.value);
  }
}
