import { describe, expect, it } from 'vitest';
import {
  ClearRoutineOccurrenceOverride,
  DelayRoutineOccurrence,
  ReplaceRoutineOccurrenceAction,
  RescheduleRoutineOccurrence,
  ShortenRoutineOccurrence,
  SkipRoutineOccurrence,
} from '..';
import {
  ActionSession,
  Day,
  DayDate,
  EntityId,
  LifeAction,
  LifeActionTitle,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceExecution,
  createRoutineBlockAssignment,
  DAY_STATUS,
} from '../../domain';
import {
  InMemoryRoutineBlockRepository,
  InMemoryRoutineOccurrenceExecutionRepository,
  InMemoryRoutineOccurrenceOverrideRepository,
} from '../../infrastructure';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import {
  TestActionSessionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';

const TODAY = DayDate.create('2026-08-08');
const TOMORROW = DayDate.create('2026-08-09');
const NOW = new Date('2026-08-08T08:00:00.000Z');

async function setup(
  options: {
    series?: boolean;
    activeSession?: boolean;
    completedDay?: boolean;
    currentDate?: DayDate;
  } = {},
) {
  const sourceActionId = EntityId.create('action-a');
  const replacement = LifeAction.createDraft({
    id: EntityId.create('action-b'),
    title: LifeActionTitle.create('Другое действие'),
    createdAt: NOW,
    eventId: EntityId.create('event-action-b'),
  });
  const block = RoutineBlock.create({
    id: EntityId.create('block-1'),
    anchorDate: TODAY,
    title: 'Работа',
    startTime: '08:00',
    endTime: '09:00',
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.daily),
    required: true,
    assignment: createRoutineBlockAssignment(
      options.series ? 'existingSeries' : ROUTINE_BLOCK_ASSIGNMENT.existingAction,
      options.series ? EntityId.create('series-a') : sourceActionId,
    ),
    now: NOW,
  });
  const routineBlockRepository = new InMemoryRoutineBlockRepository();
  await routineBlockRepository.save(block);
  const overrideRepository = new InMemoryRoutineOccurrenceOverrideRepository();
  const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository();
  const dayRepository = new FakeDayRepository();
  if (options.completedDay) {
    dayRepository.seed(
      Day.rehydrate({
        id: EntityId.create('day-completed'),
        date: TODAY,
        status: DAY_STATUS.completed,
        createdAt: NOW,
        plannedAt: null,
        openedAt: NOW,
        firstActivityAt: null,
        completedAt: new Date('2026-08-08T20:00:00.000Z'),
        summary: null,
        version: 2,
      }),
    );
  }
  const sessions = options.activeSession
    ? [
        ActionSession.start({
          id: EntityId.create('session-1'),
          lifeActionId: sourceActionId,
          startedAt: NOW,
          eventId: EntityId.create('session-event'),
        }),
      ]
    : [];
  const sourceAction = LifeAction.createDraft({
    id: sourceActionId,
    title: LifeActionTitle.create('Серия'),
    createdAt: NOW,
    eventId: EntityId.create('source-event'),
    plannedDate: TODAY,
  });
  sourceAction.setPlanningMetadata({
    occurrence: {
      ruleId: 'series-a',
      slot: TODAY.toString(),
      originalDate: TODAY.toString(),
      ruleRevision: 1,
    },
  });
  const dependencies = {
    routineBlockRepository,
    overrideRepository,
    dayRepository,
    actionSessionRepository: new TestActionSessionRepository(sessions),
    lifeActionRepository: new TestLifeActionRepository([replacement, sourceAction]),
    currentDateProvider: new FakeCurrentDateProvider(options.currentDate ?? TODAY),
    clock: new FakeClock(NOW),
    idGenerator: new FakeIdGenerator('override'),
    executionRepository,
  };
  return {
    block,
    replacement,
    overrideRepository,
    executionRepository,
    delay: new DelayRoutineOccurrence(dependencies),
    skip: new SkipRoutineOccurrence(dependencies),
    reschedule: new RescheduleRoutineOccurrence(dependencies),
    shorten: new ShortenRoutineOccurrence(dependencies),
    replace: new ReplaceRoutineOccurrenceAction(dependencies),
    clear: new ClearRoutineOccurrenceOverride(dependencies),
  };
}

function occurrenceInput(block: RoutineBlock) {
  return { routineBlockId: block.id, occurrenceDate: TODAY };
}

describe('routine occurrence commands', () => {
  it('blocks changing a series block while its dated occurrence has an active session', async () => {
    const app = await setup({ series: true, activeSession: true });
    expect(await app.skip.execute(occurrenceInput(app.block))).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.active_session' },
    });
  });
  it('creates delay without mutating the recurring block', async () => {
    const app = await setup();
    const result = await app.delay.execute({
      ...occurrenceInput(app.block),
      newStartTime: '08:30',
    });
    expect(result).toMatchObject({ ok: true, value: { startTimeOverride: '08:30', version: 1 } });
    expect(app.block.startTime).toBe('08:00');
  });

  it('rejects delay that ends outside the calendar day', async () => {
    const app = await setup();
    expect(
      await app.delay.execute({ ...occurrenceInput(app.block), newStartTime: '23:30' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.invalid_delay' },
    });
  });

  it('skips and clears one occurrence with optimistic concurrency', async () => {
    const app = await setup();
    const skipped = await app.skip.execute(occurrenceInput(app.block));
    if (!skipped.ok) throw skipped.error;
    expect(
      await app.clear.execute({
        ...occurrenceInput(app.block),
        expectedVersion: skipped.value.version,
      }),
    ).toMatchObject({ ok: true });
    expect(await app.overrideRepository.findAll()).toHaveLength(0);
  });

  it('reschedules to a future date and preserves one atomic record', async () => {
    const app = await setup();
    const result = await app.reschedule.execute({
      ...occurrenceInput(app.block),
      targetDate: TOMORROW,
      targetStartTime: '15:00',
    });
    expect(result).toMatchObject({ ok: true, value: { targetStartTime: '15:00' } });
    expect(await app.overrideRepository.findAll()).toHaveLength(1);
  });

  it('rejects a reschedule to the past', async () => {
    const app = await setup();
    expect(
      await app.reschedule.execute({
        ...occurrenceInput(app.block),
        targetDate: DayDate.create('2026-08-07'),
        targetStartTime: '15:00',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.invalid_reschedule' },
    });
  });

  it('shortens and rejects an invalid end time', async () => {
    const app = await setup();
    expect(
      await app.shorten.execute({ ...occurrenceInput(app.block), newEndTime: '08:30' }),
    ).toMatchObject({ ok: true });
    const current = (await app.overrideRepository.findAll())[0]!;
    expect(
      await app.shorten.execute({
        ...occurrenceInput(app.block),
        expectedVersion: current.version,
        newEndTime: '09:30',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.invalid_shorten' },
    });
  });

  it('replaces only the occurrence action and keeps RoutineBlock.actionId', async () => {
    const app = await setup();
    expect(
      await app.replace.execute({
        ...occurrenceInput(app.block),
        replacementActionId: app.replacement.id,
      }),
    ).toMatchObject({ ok: true });
    expect(app.block.assignment).toMatchObject({
      actionId: expect.objectContaining({ value: 'action-a' }),
    });
  });

  it('allows only one result for a double submit', async () => {
    const app = await setup();
    const results = await Promise.all([
      app.skip.execute(occurrenceInput(app.block)),
      app.skip.execute(occurrenceInput(app.block)),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await app.overrideRepository.findAll()).toHaveLength(1);
  });

  it('rejects a stale update', async () => {
    const app = await setup();
    const first = await app.skip.execute(occurrenceInput(app.block));
    if (!first.ok) throw first.error;
    expect(
      await app.delay.execute({
        ...occurrenceInput(app.block),
        expectedVersion: first.value.version + 1,
        newStartTime: '08:30',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.version_conflict' },
    });
  });

  it('blocks changes for a past date', async () => {
    const app = await setup({ currentDate: TOMORROW });
    expect(await app.skip.execute(occurrenceInput(app.block))).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.past_date' },
    });
  });

  it('blocks changes for a completed Day', async () => {
    const app = await setup({ completedDay: true });
    expect(await app.skip.execute(occurrenceInput(app.block))).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.completed_day' },
    });
  });

  it('blocks every plan mutation while the linked action has an unfinished session', async () => {
    const app = await setup({ activeSession: true });
    expect(await app.skip.execute(occurrenceInput(app.block))).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.active_session' },
    });
    expect(
      await app.delay.execute({ ...occurrenceInput(app.block), newStartTime: '08:30' }),
    ).toMatchObject({ ok: false, error: { code: 'routine_occurrence_override.active_session' } });
  });

  it('locks every plan override mutation after the occurrence has started', async () => {
    const app = await setup();
    const skipped = await app.skip.execute(occurrenceInput(app.block));
    if (!skipped.ok) throw skipped.error;
    await app.executionRepository.addIfNoRunning(
      RoutineOccurrenceExecution.start({
        id: EntityId.create('execution-history'),
        routineBlockId: app.block.id,
        occurrenceDate: TODAY,
        occurredAt: NOW,
      }),
    );
    expect(
      await app.clear.execute({
        ...occurrenceInput(app.block),
        expectedVersion: skipped.value.version,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.execution_exists' },
    });
    expect(
      await app.delay.execute({
        ...occurrenceInput(app.block),
        expectedVersion: skipped.value.version,
        newStartTime: '08:30',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_occurrence_override.execution_exists' },
    });
    expect((await app.overrideRepository.findAll())[0]).toBe(skipped.value);
  });
});
