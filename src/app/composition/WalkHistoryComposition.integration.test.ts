import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_KIND,
  DayDate,
  EntityId,
  PauseInterval,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineOccurrenceExecution,
  WALK_IMPACT,
  WALK_INTENT,
  WALK_MODE,
  WALK_TYPE,
  Walk,
  WalkCapture,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure';
import { DecisionRecordMapper } from '../../infrastructure/persistence/mappers/DecisionRecordMapper';
import { RoutineBlockRecordMapper } from '../../infrastructure/persistence/mappers/RoutineBlockRecordMapper';
import { WalkRecordMapper } from '../../infrastructure/persistence/mappers/WalkRecordMapper';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';
import type { LifeOsApplication } from './LifeOsApplication';
import { createLifeOsApplication } from './createLifeOsApplication';

const DATE = DayDate.create('2026-08-26');
const opened: LifeOsApplication[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const app of opened.splice(0)) app.close();
});
function value<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
async function setup(factory = new IDBFactory()) {
  const app = await createLifeOsApplication({
    database: new LifeOsIndexedDb(factory),
    clock: new FakeClock(new Date('2026-08-26T09:00:00Z')),
    currentDateProvider: new FakeCurrentDateProvider(DATE),
    idGenerator: new FakeIdGenerator('history'),
  });
  opened.push(app);
  expect(app.getWalkHistoryDetail).toBeDefined();
  expect(app.getWalkHistory).toBeDefined();
  return app;
}
async function decision(app: LifeOsApplication) {
  return value(
    await app.createDecisionForDate.execute({
      title: 'Выбрать следующий приоритет',
      kind: DECISION_KIND.additional,
      plannedDate: DATE,
    }),
  );
}
async function routine(app: LifeOsApplication) {
  return value(
    await app.createRoutineBlock.execute({
      anchorDate: DATE,
      title: 'Прогулка после обеда',
      startTime: '08:00',
      endTime: '08:30',
      category: ROUTINE_BLOCK_CATEGORY.physical,
      recurrence: ROUTINE_BLOCK_RECURRENCE.none,
      required: false,
      assignmentKind: 'walk',
    }),
  );
}

describe('WALK-11 composed history is a read-only projection', () => {
  it('reads duration minus pauses, question, before/after and the existing outcome', async () => {
    const app = await setup();
    const walk = historyWalk('facts', {
      intent: WALK_INTENT.reflection,
      beforeState: { energy: 4, tension: 7, clarity: 5 },
      afterState: { energy: 6, tension: 4, clarity: 7 },
      impact: WALK_IMPACT.better,
      result: 'Определён следующий приоритет',
      pauseIntervals: [
        PauseInterval.create(new Date('2026-08-26T08:10:00Z'), new Date('2026-08-26T08:20:00Z')),
      ],
    });
    await app.walkRepository.save(walk);
    const detail = await app.getWalkHistoryDetail.execute(walk.id);
    expect(detail?.walk.actualDurationMilliseconds).toBe(20 * 60 * 1000);
    expect(detail?.walk).toMatchObject({
      reflectionQuestion: 'Что сейчас важно?',
      beforeState: { energy: 4, tension: 7, clarity: 5 },
      afterState: { energy: 6, tension: 4, clarity: 7 },
      impact: 'better',
      result: 'Определён следующий приоритет',
    });
  });

  it('retains nullable state and outcome, including a zero-duration legacy record', async () => {
    const app = await setup();
    const walk = historyWalk('legacy', { intent: null, endedAt: new Date('2026-08-26T08:00:00Z') });
    await app.walkRepository.save(walk);
    const detail = await app.getWalkHistoryDetail.execute(walk.id);
    expect(detail?.walk.actualDurationMilliseconds).toBe(0);
    expect(detail?.walk).toMatchObject({
      beforeState: null,
      afterState: null,
      impact: null,
      result: null,
    });
  });

  it('reads only this walk captures, including pending and processed, without creating copies in storage', async () => {
    const app = await setup();
    const walk = historyWalk('captures');
    await app.walkRepository.save(walk);
    const capture = WalkCapture.create({
      id: EntityId.create('processed'),
      walkId: walk.id,
      content: 'Проверить гипотезу',
      capturedAt: new Date('2026-08-26T08:01:00Z'),
      walkElapsedMs: 60000,
    });
    await app.walkCaptureRepository.insert(capture);
    value(await app.processWalkCapture.execute({ captureId: capture.id, expectedVersion: 1 }));
    for (const [id, walkId] of [
      ['pending', walk.id],
      ['other', EntityId.create('other-walk')],
    ] as const)
      await app.walkCaptureRepository.insert(
        WalkCapture.create({
          id: EntityId.create(id),
          walkId,
          content: id,
          capturedAt: new Date('2026-08-26T08:02:00Z'),
          walkElapsedMs: 120000,
        }),
      );
    const before = await app.walkCaptureRepository.findByWalkId(walk.id);
    expect(
      (await app.getWalkHistoryDetail.execute(walk.id))?.captures.map((item) => [
        item.content,
        item.status,
      ]),
    ).toEqual([
      ['pending', 'pending'],
      ['Проверить гипотезу', 'processed'],
    ]);
    expect(await app.walkCaptureRepository.findByWalkId(walk.id)).toEqual(before);
  });

  it('resolves an existing Decision even without captures and leaves it unchanged', async () => {
    const app = await setup();
    const source = await decision(app);
    const walk = historyWalk('decision', { linkedEntity: { type: 'decision', id: source.id } });
    await app.walkRepository.save(walk);
    const before = DecisionRecordMapper.toRecord(source);
    expect((await app.getWalkHistoryDetail.execute(walk.id))?.sourceContext).toMatchObject({
      label: 'Выбрать следующий приоритет',
      availability: 'available',
      source: { id: source.id },
    });
    expect(
      DecisionRecordMapper.toRecord((await app.decisionRepository.findById(source.id))!),
    ).toEqual(before);
  });

  it('marks soft-deleted Decision unavailable instead of linking a deleted target', async () => {
    const app = await setup();
    const source = await decision(app);
    const walk = historyWalk('deleted', { linkedEntity: { type: 'decision', id: source.id } });
    await app.walkRepository.save(walk);
    const deleted = DecisionRecordMapper.fromRecord({
      ...DecisionRecordMapper.toRecord(source),
      deletedAt: '2026-08-26T09:01:00.000Z',
    });
    await app.decisionRepository.save(deleted);
    expect((await app.getWalkHistoryDetail.execute(walk.id))?.sourceContext).toMatchObject({
      label: null,
      availability: 'missing',
    });
  });

  it.each(['decision', 'routine'] as const)(
    'handles a missing %s without losing walk facts',
    async (type) => {
      const app = await setup();
      const walk = historyWalk(type, { linkedEntity: { type, id: EntityId.create('missing') } });
      await app.walkRepository.save(walk);
      expect(await app.getWalkHistoryDetail.execute(walk.id)).toMatchObject({
        walk: { id: walk.id },
        sourceContext: { availability: 'missing', label: null },
      });
    },
  );

  it.each(['decision', 'routine'] as const)(
    'degrades only optional %s lookup errors',
    async (type) => {
      const app = await setup();
      const walk = historyWalk(type, { linkedEntity: { type, id: EntityId.create('offline') } });
      await app.walkRepository.save(walk);
      vi.spyOn(
        type === 'decision' ? app.decisionRepository : app.routineBlockRepository,
        'findById',
      ).mockRejectedValue(new Error('optional context offline'));
      expect((await app.getWalkHistoryDetail.execute(walk.id))?.sourceContext).toMatchObject({
        availability: 'unavailable',
        label: null,
      });
    },
  );

  it('resolves Routine without changing the block or its execution', async () => {
    const app = await setup();
    const source = await routine(app);
    const walk = historyWalk('routine', { linkedEntity: { type: 'routine', id: source.id } });
    await app.walkRepository.save(walk);
    const before = RoutineBlockRecordMapper.toRecord(source);
    const execution = RoutineOccurrenceExecution.start({
      id: EntityId.create('existing-execution'),
      routineBlockId: source.id,
      occurrenceDate: DATE,
      occurredAt: new Date('2026-08-26T08:00:00Z'),
    });
    expect(await app.routineOccurrenceExecutionRepository.addIfNoRunning(execution)).toBe('saved');
    const executions = await app.routineOccurrenceExecutionRepository.findAll();
    expect((await app.getWalkHistoryDetail.execute(walk.id))?.sourceContext).toMatchObject({
      label: 'Прогулка после обеда',
      availability: 'available',
    });
    expect(
      RoutineBlockRecordMapper.toRecord((await app.routineBlockRepository.findById(source.id))!),
    ).toEqual(before);
    expect(await app.routineOccurrenceExecutionRepository.findAll()).toEqual(executions);
  });

  it('keeps historical Routine title without enabling a missing live target', async () => {
    const app = await setup();
    const source = {
      routineBlockId: EntityId.create('removed-routine'),
      occurrenceDate: DATE,
      effectiveDate: DATE,
    };
    const walk = historyWalk('historical-routine', {
      linkedEntity: { type: 'routine', id: source.routineBlockId },
      returnContext: {
        origin: 'routine',
        entity: { type: 'routine', id: source.routineBlockId },
        nextStep: null,
        routineContext: { source, sourceTitle: 'Прежний шаг распорядка', next: null },
      },
    });
    await app.walkRepository.save(walk);
    const detail = await app.getWalkHistoryDetail.execute(walk.id);
    expect(detail?.walk.returnContext?.routineContext?.sourceTitle).toBe('Прежний шаг распорядка');
    expect(detail?.sourceContext).toMatchObject({ label: null, availability: 'missing' });
  });

  it('uses returnContext entity only when linkedEntity is absent', async () => {
    const app = await setup();
    const source = await decision(app);
    const walk = historyWalk('return-source', {
      returnContext: {
        origin: 'decision',
        entity: { type: 'decision', id: source.id },
        nextStep: null,
      },
    });
    await app.walkRepository.save(walk);
    expect((await app.getWalkHistoryDetail.execute(walk.id))?.sourceContext?.label).toBe(
      source.title.toString(),
    );
  });

  it('keeps other stored link types without inventing a Decision/Routine target', async () => {
    const app = await setup();
    const walk = historyWalk('project', {
      linkedEntity: { type: 'project', id: EntityId.create('project') },
    });
    await app.walkRepository.save(walk);
    expect(await app.getWalkHistoryDetail.execute(walk.id)).toMatchObject({
      walk: { linkedEntity: { type: 'project' } },
      sourceContext: null,
    });
  });

  it('returns unavailable for an absent or noncompleted selected walk', async () => {
    const app = await setup();
    const planned = Walk.create({
      id: EntityId.create('planned'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-26T07:00:00Z'),
    });
    await app.walkRepository.save(planned);
    expect(await app.getWalkHistoryDetail.execute(planned.id)).toBeNull();
    expect(await app.getWalkHistoryDetail.execute(EntityId.create('missing'))).toBeNull();
    await app.walkRepository.save(
      planned.start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-26T08:00:00Z'),
        reflectionQuestion: 'Вопрос',
      }),
    );
    expect(await app.getWalkHistoryDetail.execute(planned.id)).toBeNull();
  });

  it.each(['walk', 'capture'] as const)(
    'surfaces core %s storage errors instead of an empty detail',
    async (store) => {
      const app = await setup();
      const walk = historyWalk();
      await app.walkRepository.save(walk);
      if (store === 'walk')
        vi.spyOn(app.walkRepository, 'findById').mockRejectedValue(new Error('walk offline'));
      else
        vi.spyOn(app.walkCaptureRepository, 'findByWalkId').mockRejectedValue(
          new Error('capture offline'),
        );
      await expect(app.getWalkHistoryDetail.execute(walk.id)).rejects.toThrow(`${store} offline`);
    },
  );

  it('leaves complete persisted Walk facts/version/Reentry unchanged through filters, details and reopen', async () => {
    const factory = new IDBFactory();
    let app = await setup(factory);
    const walk = historyWalk().recordOutcome({
      afterState: { energy: 5, tension: 3, clarity: 7 },
      impact: WALK_IMPACT.better,
      reflection: 'Итог',
      updatedAt: new Date('2026-08-26T08:31:00Z'),
      reentryAction: { kind: 'today', destination: 'today', entity: null, nextStep: null },
    });
    await app.walkRepository.save(walk);
    const before = WalkRecordMapper.toRecord(walk);
    for (const intent of [
      undefined,
      WALK_INTENT.free,
      WALK_INTENT.recovery,
      WALK_INTENT.reflection,
    ]) {
      await app.getWalkHistory.execute(intent);
      await app.getWalkHistoryDetail.execute(walk.id);
    }
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      before,
    );
    app.close();
    app = await setup(factory);
    expect((await app.getWalkHistory.execute()).map((item) => item.id.toString())).toEqual([
      'history-walk',
    ]);
    expect(
      WalkRecordMapper.toRecord((await app.getWalkHistoryDetail.execute(walk.id))!.walk),
    ).toEqual(before);
  });
});
