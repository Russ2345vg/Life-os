import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  DECISION_KIND,
  EntityId,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  ROUTINE_EXECUTION_STATUS,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineOccurrenceOverride,
  WALK_IMPACT,
  WALK_INTENT,
  WALK_MODE,
  WALK_REENTRY_STATUS,
  WALK_STATUS,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

const DATE = DayDate.create('2026-08-25');
const YESTERDAY = DayDate.create('2026-08-24');
const STARTED_AT = new Date('2026-08-25T08:05:00.000Z');

describe('routine-linked Walk composition', () => {
  it('starts, restores, completes and resolves Reentry without touching adjacent state', async () => {
    const factory = new IDBFactory();
    const clock = new FakeClock(STARTED_AT);
    const first = await application(factory, clock, 'routine-walk-complete');
    await openCurrentDay(first);
    const source = await createRoutineBlock(first, {
      title: 'Утренняя прогулка',
      startTime: '08:00',
      endTime: '08:30',
      assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.walk,
    });
    const next = await createRoutineBlock(first, {
      title: 'Завтрак',
      startTime: '09:00',
      endTime: '09:30',
      assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.reminder,
    });
    const actionsBefore = await first.lifeActionRepository.findByDate(DATE);

    const started = await first.startRoutineWalk.execute({
      source: {
        routineBlockId: source.id,
        occurrenceDate: DATE,
        effectiveDate: DATE,
      },
      intent: WALK_INTENT.free,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 20,
    });

    expect(started).toMatchObject({
      ok: true,
      value: {
        status: WALK_STATUS.running,
        returnContext: {
          nextStep: 'Завтрак',
          routineContext: {
            sourceTitle: 'Утренняя прогулка',
            next: { routineBlockId: next.id, occurrenceDate: DATE, effectiveDate: DATE },
          },
        },
      },
    });
    expect(await first.getRunningRoutineOccurrence.execute()).toMatchObject({
      execution: { status: ROUTINE_EXECUTION_STATUS.running, actualStartedAt: STARTED_AT },
    });
    expect(await first.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await first.lifeActionRepository.findByDate(DATE)).toEqual(actionsBefore);
    expect(await first.routineBlockRepository.findAll()).toHaveLength(2);
    expect(await first.routineOccurrenceOverrideRepository.findAll()).toEqual([]);
    first.close();

    const finishClock = new FakeClock(new Date('2026-08-25T08:35:00.000Z'));
    const reopened = await application(factory, finishClock, 'routine-walk-complete-reopened');
    const active = await reopened.getActiveWalk.execute();
    expect(active).toMatchObject({ status: WALK_STATUS.running, mode: WALK_MODE.timer });
    if (active === null) throw new Error('Routine Walk was not restored');
    const completed = await reopened.completeWalk.execute({ walkId: active.id });
    expect(completed).toMatchObject({ ok: true, value: { status: WALK_STATUS.completed } });
    if (!completed.ok) throw completed.error;
    finishClock.setTime(new Date('2026-08-25T08:37:00.000Z'));
    await expect(
      reopened.recordWalkOutcome.execute({
        walkId: completed.value.id,
        afterState: { energy: 7, tension: 2, clarity: 8 },
        impact: WALK_IMPACT.better,
      }),
    ).resolves.toMatchObject({ ok: true });
    const pending = await reopened.getPendingWalkReentry.execute();
    expect(pending).toMatchObject({
      reentry: {
        status: WALK_REENTRY_STATUS.pending,
        action: {
          destination: 'routine',
          nextStep: 'Завтрак',
          routineContext: {
            source: { routineBlockId: source.id, occurrenceDate: DATE, effectiveDate: DATE },
            next: { routineBlockId: next.id, occurrenceDate: DATE, effectiveDate: DATE },
          },
        },
      },
    });
    if (pending === null) throw new Error('Routine Reentry was not prepared');
    await expect(
      reopened.completeWalkReentry.execute({ walkId: pending.id }),
    ).resolves.toMatchObject({ ok: true });
    await expect(reopened.getPendingWalkReentry.execute()).resolves.toBeNull();
    await expect(
      reopened.routineOccurrenceExecutionRepository.findByOccurrence(source.id, DATE),
    ).resolves.toMatchObject({
      status: ROUTINE_EXECUTION_STATUS.completed,
      actualEndedAt: new Date('2026-08-25T08:35:00.000Z'),
    });
    expect(await reopened.actionSessionRepository.findUnfinished()).toBeNull();
    expect(await reopened.lifeActionRepository.findByDate(DATE)).toEqual(actionsBefore);
    reopened.close();
  });

  it('restores and atomically abandons a routine-linked Walk', async () => {
    const factory = new IDBFactory();
    const first = await application(factory, new FakeClock(STARTED_AT), 'routine-walk-abandon');
    await openCurrentDay(first);
    const source = await createRoutineBlock(first, {
      title: 'Вечерняя прогулка',
      startTime: '18:00',
      endTime: '18:30',
      assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.walk,
    });
    const started = await first.startRoutineWalk.execute({
      source: { routineBlockId: source.id, occurrenceDate: DATE, effectiveDate: DATE },
      intent: WALK_INTENT.recovery,
      mode: WALK_MODE.stopwatch,
    });
    if (!started.ok) throw started.error;
    first.close();

    const reopened = await application(
      factory,
      new FakeClock(new Date('2026-08-25T08:20:00.000Z')),
      'routine-walk-abandon-reopened',
    );
    const active = await reopened.getActiveWalk.execute();
    if (active === null) throw new Error('Routine Walk was not restored');
    await expect(reopened.abandonWalk.execute({ walkId: active.id })).resolves.toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.abandoned, reentry: null },
    });
    await expect(
      reopened.routineOccurrenceExecutionRepository.findByOccurrence(source.id, DATE),
    ).resolves.toMatchObject({ status: ROUTINE_EXECUTION_STATUS.abandoned });
    await expect(reopened.getPendingWalkReentry.execute()).resolves.toBeNull();
    reopened.close();
  });

  it('starts a rescheduled historical occurrence on its effective date', async () => {
    const factory = new IDBFactory();
    const app = await application(factory, new FakeClock(STARTED_AT), 'routine-walk-rescheduled');
    await openCurrentDay(app);
    const source = await createRoutineBlock(app, {
      anchorDate: YESTERDAY,
      title: 'Перенесённая прогулка',
      startTime: '08:00',
      endTime: '08:30',
      assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.walk,
    });
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('routine-walk-rescheduled-override'),
      routineBlockId: source.id,
      occurrenceDate: YESTERDAY,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      targetDate: DATE,
      targetStartTime: '11:00',
      now: new Date('2026-08-24T07:00:00.000Z'),
    });
    await app.routineOccurrenceOverrideRepository.saveIfVersionMatches(override, null);

    const result = await app.startRoutineWalk.execute({
      source: { routineBlockId: source.id, occurrenceDate: YESTERDAY, effectiveDate: DATE },
      intent: WALK_INTENT.free,
      mode: WALK_MODE.stopwatch,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        date: DATE,
        returnContext: {
          routineContext: { source: { occurrenceDate: YESTERDAY, effectiveDate: DATE } },
        },
      },
    });
    await expect(
      app.routineOccurrenceExecutionRepository.findByOccurrence(source.id, YESTERDAY),
    ).resolves.toMatchObject({ status: ROUTINE_EXECUTION_STATUS.running });
    app.close();
  });
});

async function application(factory: IDBFactory, clock: FakeClock, prefix: string) {
  return createLifeOsApplication({
    database: new LifeOsIndexedDb(factory),
    clock,
    currentDateProvider: new FakeCurrentDateProvider(DATE),
    idGenerator: new FakeIdGenerator(prefix),
  });
}

async function openCurrentDay(
  application: Awaited<ReturnType<typeof createLifeOsApplication>>,
): Promise<void> {
  const decision = await application.createDecisionForDate.execute({
    title: 'Главное решение дня',
    kind: DECISION_KIND.main,
    plannedDate: DATE,
    expectedResult: 'День открыт',
  });
  if (!decision.ok) throw decision.error;
  const started = await application.startCurrentDay.execute();
  if (!started.ok) throw started.error;
}

async function createRoutineBlock(
  application: Awaited<ReturnType<typeof createLifeOsApplication>>,
  input: {
    readonly anchorDate?: DayDate;
    readonly title: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly assignmentKind:
      typeof ROUTINE_BLOCK_ASSIGNMENT.walk | typeof ROUTINE_BLOCK_ASSIGNMENT.reminder;
  },
) {
  const result = await application.createRoutineBlock.execute({
    anchorDate: input.anchorDate ?? DATE,
    title: input.title,
    startTime: input.startTime,
    endTime: input.endTime,
    category: ROUTINE_BLOCK_CATEGORY.physical,
    recurrence: ROUTINE_BLOCK_RECURRENCE.none,
    required: true,
    assignmentKind: input.assignmentKind,
  });
  if (!result.ok) throw result.error;
  return result.value;
}
