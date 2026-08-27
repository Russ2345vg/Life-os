import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as application from '../../application';
import {
  DECISION_KIND,
  DayDate,
  EntityId,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  WALK_IMPACT,
  WALK_INTENT,
  WALK_MODE,
  WalkCapture,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure';
import { DecisionRecordMapper } from '../../infrastructure/persistence/mappers/DecisionRecordMapper';
import { RoutineBlockRecordMapper } from '../../infrastructure/persistence/mappers/RoutineBlockRecordMapper';
import { RoutineOccurrenceExecutionRecordMapper } from '../../infrastructure/persistence/mappers/RoutineOccurrenceExecutionRecordMapper';
import { WalkRecordMapper } from '../../infrastructure/persistence/mappers/WalkRecordMapper';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
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
async function setup(
  factory = new IDBFactory(),
  clock = new FakeClock(new Date('2026-08-26T08:00:00Z')),
) {
  const app = await createLifeOsApplication({
    database: new LifeOsIndexedDb(factory),
    clock,
    currentDateProvider: new FakeCurrentDateProvider(DATE),
    idGenerator: new FakeIdGenerator(`capture-${opened.length}`),
  });
  opened.push(app);
  expect(app.createWalkCapture).toBeDefined();
  return { app, clock, factory };
}
async function start(app: LifeOsApplication) {
  const planned = value(
    await app.createWalk.execute({ date: DATE, intent: WALK_INTENT.reflection }),
  );
  return value(await app.startWalk.execute({ walkId: planned.id, mode: WALK_MODE.stopwatch }));
}

describe('WALK-10 Capture composition', () => {
  it('persists a trimmed thought at the existing timer offset without changing Walk or Actions', async () => {
    const { app, clock } = await setup();
    const walk = await start(app);
    const before = WalkRecordMapper.toRecord(walk);
    clock.setTime(new Date('2026-08-26T08:00:05Z'));
    const capture = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: '  Проверить гипотезу  ' }),
    );
    expect(capture).toMatchObject({
      content: 'Проверить гипотезу',
      walkElapsedMs: 5000,
      capturedAt: clock.now(),
      status: 'pending',
      version: 1,
    });
    expect(await app.walkCaptureRepository.findById(capture.id)).toEqual(capture);
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      before,
    );
    expect(await app.lifeActionRepository.findByDate(DATE)).toEqual([]);
    expect(await app.actionSessionRepository.findUnfinished()).toBeNull();
  });

  it('uses pause/resume elapsed semantics and does not add or close pauses', async () => {
    const { app, clock } = await setup();
    const walk = await start(app);
    clock.setTime(new Date('2026-08-26T08:00:10Z'));
    const paused = value(await app.pauseWalk.execute({ walkId: walk.id }));
    clock.setTime(new Date('2026-08-26T08:00:30Z'));
    expect(
      value(await app.createWalkCapture.execute({ walkId: walk.id, content: 'На паузе' }))
        .walkElapsedMs,
    ).toBe(10000);
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      WalkRecordMapper.toRecord(paused),
    );
    clock.setTime(new Date('2026-08-26T08:00:50Z'));
    const resumed = value(await app.resumeWalk.execute({ walkId: walk.id }));
    clock.setTime(new Date('2026-08-26T08:01:00Z'));
    expect(
      value(await app.createWalkCapture.execute({ walkId: walk.id, content: 'После паузы' }))
        .walkElapsedMs,
    ).toBe(20000);
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      WalkRecordMapper.toRecord(resumed),
    );
  });

  it('restores two thoughts, orders by captured time, edits and processes durably without losing history', async () => {
    const fixture = await setup();
    let app = fixture.app;
    const walk = await start(app);
    const first = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Первая' }),
    );
    fixture.clock.setTime(new Date('2026-08-26T08:00:06Z'));
    const second = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Вторая' }),
    );
    app.close();
    app = (await setup(fixture.factory, fixture.clock)).app;
    expect((await app.getActiveWalk.execute())?.status).toBe('running');
    expect((await app.getPendingWalkCaptures.execute()).map((item) => item.capture.id)).toEqual([
      second.id,
      first.id,
    ]);
    fixture.clock.setTime(new Date('2026-08-26T08:00:09Z'));
    const edited = value(
      await app.updateWalkCapture.execute({
        captureId: first.id,
        expectedVersion: first.version,
        content: '  Уточнённая первая  ',
      }),
    );
    expect(edited).toMatchObject({
      content: 'Уточнённая первая',
      capturedAt: first.capturedAt,
      walkElapsedMs: first.walkElapsedMs,
      version: 2,
    });
    expect((await app.getPendingWalkCaptures.execute()).map((item) => item.capture.id)).toEqual([
      second.id,
      first.id,
    ]);
    value(
      await app.processWalkCapture.execute({
        captureId: first.id,
        expectedVersion: edited.version,
      }),
    );
    app.close();
    app = (await setup(fixture.factory, fixture.clock)).app;
    expect((await app.getPendingWalkCaptures.execute()).map((item) => item.capture.id)).toEqual([
      second.id,
    ]);
    expect((await app.getWalkCaptures.execute(walk.id)).map((item) => item.capture.status)).toEqual(
      ['pending', 'processed'],
    );
    expect((await app.getWalkCaptureById.execute(first.id))?.capture.content).toBe(
      'Уточнённая первая',
    );
  });

  it.each(['', '  ', 'x'.repeat(501)])(
    'rejects invalid content without a record: %j',
    async (content) => {
      const { app } = await setup();
      const walk = await start(app);
      expect(await app.createWalkCapture.execute({ walkId: walk.id, content })).toMatchObject({
        ok: false,
        error: { code: 'walk_capture.invalid_content' },
      });
      expect(await app.getWalkCaptures.execute(walk.id)).toEqual([]);
    },
  );

  it.each(['missing', 'planned', 'completed', 'abandoned'] as const)(
    'rejects creation on a %s Walk',
    async (status) => {
      const { app } = await setup();
      const walk = value(await app.createWalk.execute({ date: DATE, intent: WALK_INTENT.free }));
      if (status === 'completed' || status === 'abandoned') {
        value(await app.startWalk.execute({ walkId: walk.id, mode: WALK_MODE.stopwatch }));
        value(
          await (status === 'completed' ? app.completeWalk : app.abandonWalk).execute({
            walkId: walk.id,
          }),
        );
      }
      expect(
        await app.createWalkCapture.execute({
          walkId: status === 'missing' ? EntityId.create('missing') : walk.id,
          content: 'Не сохранить',
        }),
      ).toMatchObject({ ok: false });
      expect(await app.walkCaptureRepository.findPending()).toEqual([]);
    },
  );

  it('does not block completion or Reentry and processing does not rewrite the outcome', async () => {
    const { app } = await setup();
    const walk = await start(app);
    const capture = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Пока не обработано' }),
    );
    value(await app.completeWalk.execute({ walkId: walk.id }));
    value(
      await app.recordWalkOutcome.execute({
        walkId: walk.id,
        afterState: { energy: 5, tension: 4, clarity: 7 },
        impact: WALK_IMPACT.better,
        reflection: 'Отдельный итог',
      }),
    );
    value(await app.completeWalkReentry.execute({ walkId: walk.id }));
    const before = WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!);
    expect(await app.getPendingWalkReentry.execute()).toBeNull();
    value(
      await app.processWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: capture.version,
      }),
    );
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      before,
    );
    expect(await app.getWalkCaptures.execute(walk.id)).toHaveLength(1);
    const processed = (await app.walkCaptureRepository.findById(capture.id))!;
    const editedProcessed = value(
      await app.updateWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: processed.version,
        content: 'Уточнение уже обработанной мысли',
      }),
    );
    expect(editedProcessed.status).toBe('processed');
    expect(await app.getPendingWalkCaptures.execute()).toEqual([]);
    expect((await app.getWalkCaptures.execute(walk.id))[0]?.capture.content).toBe(
      'Уточнение уже обработанной мысли',
    );
    expect((await app.walkCaptureRepository.findById(capture.id))?.status).toBe('processed');
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      before,
    );
  });

  it('retains thoughts after abandon and missing Walk, including independent edit/process', async () => {
    const { app } = await setup();
    const walk = await start(app);
    const capture = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Сохранить в любом случае' }),
    );
    const abandoned = value(await app.abandonWalk.execute({ walkId: walk.id }));
    expect(await app.getPendingWalkCaptures.execute()).toHaveLength(1);
    // Simulate a missing external source; public DeleteWalk restrictions are unchanged.
    expect(await app.walkRepository.deleteIfVersionMatches(walk.id, abandoned.version)).toBe(true);
    expect(await app.getWalkCaptureById.execute(capture.id)).toMatchObject({
      capture: { content: capture.content },
      walk: null,
      contextLabel: null,
    });
    const edited = value(
      await app.updateWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: capture.version,
        content: 'Источник недоступен, мысль осталась',
      }),
    );
    value(
      await app.processWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: edited.version,
      }),
    );
    expect((await app.getWalkCaptures.execute(walk.id))[0]?.capture.status).toBe('processed');
  });

  it('protects against stale edits and processing; processing is idempotent', async () => {
    const { app } = await setup();
    const walk = await start(app);
    const capture = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Версия 1' }),
    );
    const edited = value(
      await app.updateWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: 1,
        content: 'Версия 2',
      }),
    );
    expect(
      await app.updateWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: 1,
        content: 'Чужая перезапись',
      }),
    ).toMatchObject({ ok: false, error: { code: 'walk_capture.version_conflict' } });
    expect(
      await app.processWalkCapture.execute({ captureId: capture.id, expectedVersion: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'walk_capture.version_conflict' } });
    const processed = value(
      await app.processWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: edited.version,
      }),
    );
    expect(
      value(
        await app.processWalkCapture.execute({
          captureId: capture.id,
          expectedVersion: edited.version,
        }),
      ),
    ).toEqual(processed);
    expect((await app.walkCaptureRepository.findById(capture.id))?.content).toBe('Версия 2');
  });

  it('reads Decision context through Walk and never changes the Decision or creates Actions', async () => {
    const { app } = await setup();
    const source = value(
      await app.createDecisionForDate.execute({
        title: 'Какой шаг выбрать?',
        kind: DECISION_KIND.additional,
        plannedDate: DATE,
        expectedResult: 'Ясность',
        reason: 'Причина',
        price: 'Час',
      }),
    );
    const before = DecisionRecordMapper.toRecord(source);
    const walk = value(
      await app.startDecisionWalk.execute({ decisionId: source.id, timerTargetMinutes: 30 }),
    );
    const capture = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Проверить допущение' }),
    );
    expect(await app.getWalkCaptureById.execute(capture.id)).toMatchObject({
      contextLabel: 'Какой шаг выбрать?',
      walk: { linkedEntity: { type: 'decision', id: source.id } },
    });
    value(await app.processWalkCapture.execute({ captureId: capture.id, expectedVersion: 1 }));
    expect(
      DecisionRecordMapper.toRecord((await app.decisionRepository.findById(source.id))!),
    ).toEqual(before);
    expect(await app.lifeActionRepository.findByDecisionId(source.id)).toEqual([]);
    vi.spyOn(app.decisionRepository, 'findById').mockRejectedValueOnce(
      new Error('Context unavailable'),
    );
    expect(await app.getWalkCaptureById.execute(capture.id)).toMatchObject({
      contextLabel: null,
      capture: { id: capture.id },
    });
  });

  it('reads Routine context without changing its block or running execution', async () => {
    const { app } = await setup();
    value(
      await app.createDecisionForDate.execute({
        title: 'Главное',
        kind: DECISION_KIND.main,
        plannedDate: DATE,
        expectedResult: 'День открыт',
      }),
    );
    value(await app.startCurrentDay.execute());
    const block = value(
      await app.createRoutineBlock.execute({
        anchorDate: DATE,
        title: 'Прогулка после обеда',
        startTime: '08:00',
        endTime: '08:30',
        category: ROUTINE_BLOCK_CATEGORY.physical,
        recurrence: ROUTINE_BLOCK_RECURRENCE.none,
        required: true,
        assignmentKind: 'walk',
      }),
    );
    const walk = value(
      await app.startRoutineWalk.execute({
        source: { routineBlockId: block.id, occurrenceDate: DATE, effectiveDate: DATE },
        intent: WALK_INTENT.free,
        mode: WALK_MODE.stopwatch,
      }),
    );
    const blockBefore = RoutineBlockRecordMapper.toRecord(block);
    const executionBefore = (await app.routineOccurrenceExecutionRepository.findAll()).map(
      RoutineOccurrenceExecutionRecordMapper.toRecord,
    );
    const capture = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Мысль из распорядка' }),
    );
    const edited = value(
      await app.updateWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: 1,
        content: 'Уточнение',
      }),
    );
    value(
      await app.processWalkCapture.execute({
        captureId: capture.id,
        expectedVersion: edited.version,
      }),
    );
    expect((await app.getWalkCaptureById.execute(capture.id))?.contextLabel).toBe(block.title);
    expect(
      RoutineBlockRecordMapper.toRecord((await app.routineBlockRepository.findById(block.id))!),
    ).toEqual(blockBefore);
    expect(
      (await app.routineOccurrenceExecutionRepository.findAll()).map(
        RoutineOccurrenceExecutionRecordMapper.toRecord,
      ),
    ).toEqual(executionBefore);
  });

  it('retains captures on context errors, but does not hide capture storage errors as an empty Inbox', async () => {
    const { app } = await setup();
    const walk = await start(app);
    const capture = value(
      await app.createWalkCapture.execute({ walkId: walk.id, content: 'Важная мысль' }),
    );
    vi.spyOn(app.walkRepository, 'findById').mockRejectedValue(new Error('Walk unavailable'));
    expect(await app.getPendingWalkCaptures.execute()).toMatchObject([
      { capture: { id: capture.id }, walk: null, contextLabel: null },
    ]);
    vi.spyOn(app.walkCaptureRepository, 'findPending').mockRejectedValue(
      new Error('Capture storage unavailable'),
    );
    await expect(app.getPendingWalkCaptures.execute()).rejects.toThrow(
      'Capture storage unavailable',
    );
  });

  it('uses deterministic id ordering for equal capture times, independent of edits', async () => {
    const { app, clock } = await setup();
    const walk = await start(app);
    for (const id of ['z', 'a'])
      await app.walkCaptureRepository.insert(
        WalkCapture.create({
          id: EntityId.create(id),
          walkId: walk.id,
          content: id,
          capturedAt: clock.now(),
          walkElapsedMs: 0,
        }),
      );
    expect(
      (await app.getPendingWalkCaptures.execute()).map((item) => item.capture.id.toString()),
    ).toEqual(['a', 'z']);
  });

  it('preserves a thought if another tab completes after the active-state read', async () => {
    const { app, clock } = await setup();
    const walk = await start(app);
    let completedRecord: ReturnType<typeof WalkRecordMapper.toRecord> | undefined;
    const command = new application.CreateWalkCapture(
      app.walkCaptureRepository,
      {
        findById: async (id) => {
          const snapshot = await app.walkRepository.findById(id);
          const completed = value(await app.completeWalk.execute({ walkId: id }));
          completedRecord = WalkRecordMapper.toRecord(completed);
          return snapshot;
        },
      },
      clock,
      new FakeIdGenerator('concurrent-capture'),
    );
    const capture = value(await command.execute({ walkId: walk.id, content: 'Успеть сохранить' }));
    expect(await app.walkCaptureRepository.findById(capture.id)).toEqual(capture);
    expect(WalkRecordMapper.toRecord((await app.walkRepository.findById(walk.id))!)).toEqual(
      completedRecord,
    );
  });
});
