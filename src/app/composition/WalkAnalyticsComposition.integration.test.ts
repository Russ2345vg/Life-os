import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId, WalkCapture } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure';
import { WalkRecordMapper } from '../../infrastructure/persistence/mappers/WalkRecordMapper';
import { WalkCaptureRecordMapper } from '../../infrastructure/persistence/mappers/WalkCaptureRecordMapper';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';
import type { LifeOsApplication } from './LifeOsApplication';
import { createLifeOsApplication } from './createLifeOsApplication';

const opened: LifeOsApplication[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const app of opened.splice(0)) app.close();
});
async function setup(factory = new IDBFactory()) {
  const app = await createLifeOsApplication({
    database: new LifeOsIndexedDb(factory),
    clock: new FakeClock(new Date('2026-08-26T09:00:00Z')),
    currentDateProvider: new FakeCurrentDateProvider(DayDate.create('2026-08-26')),
    idGenerator: new FakeIdGenerator('analytics'),
  });
  opened.push(app);
  expect(app.getWalkAnalytics).toBeDefined();
  return app;
}

describe('WALK-12 composed read-only analytics', () => {
  it('WALK-13 exposes evidence without changing persisted walks or consuming Reentry', async () => {
    const factory = new IDBFactory();
    const app = await setup(factory);
    for (let i = 0; i < 8; i++) {
      await app.walkRepository.save(
        historyWalk(`insight-${i}`, {
          intent: 'recovery',
          beforeState: { energy: 3, tension: 8, clarity: 3 },
        }).recordOutcome({
          afterState: { energy: 5, tension: 6, clarity: 5 },
          impact: 'better',
          updatedAt: new Date('2026-08-26T08:31:00Z'),
          reentryAction: { kind: 'today', destination: 'today', entity: null, nextStep: null },
        }),
      );
    }
    const before = (await app.walkRepository.findAll()).map(WalkRecordMapper.toRecord);
    expect(app.getWalkRecommendation, 'composed read-only recommendation query').toBeDefined();
    expect(
      await app.getWalkRecommendation.execute({ energy: 4, tension: 7, clarity: 3 }),
    ).toMatchObject({
      intent: 'recovery',
      sampleSize: 8,
      confidenceLevel: 'stable',
      insight: { kind: 'beforeState' },
    });
    await app.getWalkAnalytics.execute('last7Days');
    app.close();
    const reopened = await setup(factory);
    expect((await reopened.walkRepository.findAll()).map(WalkRecordMapper.toRecord)).toEqual(
      before,
    );
    expect(await reopened.getPendingWalkReentry.execute()).not.toBeNull();
  });
  it('reads persisted outcomes/captures and leaves complete records and pending Reentry unchanged after reopen', async () => {
    const factory = new IDBFactory();
    const app = await setup(factory);
    const walk = historyWalk('saved', {
      beforeState: { energy: 2, tension: 8, clarity: 3 },
    }).recordOutcome({
      afterState: { energy: 4, tension: 5, clarity: 5 },
      impact: 'better',
      reflection: 'Есть следующий шаг',
      updatedAt: new Date('2026-08-26T08:31:00Z'),
      reentryAction: { kind: 'today', destination: 'today', entity: null, nextStep: null },
    });
    await app.walkRepository.save(walk);
    const capture = WalkCapture.create({
      id: EntityId.create('saved-thought'),
      walkId: walk.id,
      content: 'Не потерять мысль',
      capturedAt: new Date('2026-08-26T08:10:00Z'),
      walkElapsedMs: 600000,
    }).process(new Date('2026-08-26T08:40:00Z'));
    await app.walkCaptureRepository.insert(capture);
    const beforeWalk = WalkRecordMapper.toRecord(walk);
    const beforeCapture = WalkCaptureRecordMapper.toRecord(capture);

    const analytics = await app.getWalkAnalytics.execute();
    expect(analytics).toMatchObject({
      completedCount: 1,
      withTextResultCount: 1,
      withCapturesCount: 1,
      captureCount: 1,
      impactCounts: { better: 1, same: 0, worse: 0 },
    });
    expect(analytics.state.energy).toMatchObject({ sampleSize: 1, averageDelta: 2 });
    await app.getWalkAnalytics.execute('last7Days');
    const history = await app.getWalkHistoryDetail.execute(walk.id);
    expect(history?.walk.reentry?.status).toBe('pending');
    app.close();

    const reopened = await setup(factory);
    expect(await reopened.getWalkAnalytics.execute()).toEqual(analytics);
    expect(WalkRecordMapper.toRecord((await reopened.walkRepository.findById(walk.id))!)).toEqual(
      beforeWalk,
    );
    expect(
      WalkCaptureRecordMapper.toRecord(
        (await reopened.walkCaptureRepository.findById(capture.id))!,
      ),
    ).toEqual(beforeCapture);
    expect((await reopened.getPendingWalkReentry.execute())?.id.toString()).toBe('saved');
  });
  it('keeps persisted legacy absence and zero duration factual, without backfilling a mode or state', async () => {
    const app = await setup();
    const walk = historyWalk('legacy', { intent: null, endedAt: new Date('2026-08-26T08:00:00Z') });
    await app.walkRepository.save(walk);
    expect(await app.getWalkAnalytics.execute()).toMatchObject({
      completedCount: 1,
      averageDurationMilliseconds: 0,
      unclassifiedCount: 1,
      state: { energy: { sampleSize: 0, averageDelta: null } },
      byIntent: { free: { count: 0 } },
    });
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      WalkRecordMapper.toRecord(walk),
    );
  });
  it.each(['walks', 'captures'] as const)(
    'propagates persisted %s read errors for a retryable screen',
    async (source) => {
      const app = await setup();
      await app.walkRepository.save(historyWalk());
      if (source === 'walks')
        vi.spyOn(app.walkRepository, 'findAll').mockRejectedValue(new Error('offline'));
      else
        vi.spyOn(app.walkCaptureRepository, 'findByWalkId').mockRejectedValue(new Error('offline'));
      await expect(app.getWalkAnalytics.execute()).rejects.toThrow('offline');
    },
  );
});
