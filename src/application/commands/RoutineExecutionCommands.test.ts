import { describe, expect, it } from 'vitest';
import { AbandonRoutineOccurrence, CompleteRoutineOccurrence, StartRoutineOccurrence } from '..';
import {
  Day,
  DayDate,
  EntityId,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceOverride,
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

const TODAY = DayDate.create('2026-08-08');
const TOMORROW = DayDate.create('2026-08-09');

async function setup(
  options: {
    readonly currentDate?: DayDate;
    readonly override?: RoutineOccurrenceOverride;
    readonly now?: Date;
    readonly completedDay?: boolean;
  } = {},
) {
  const currentDate = options.currentDate ?? TODAY;
  const now = options.now ?? new Date('2026-08-08T08:12:00.000Z');
  const block = RoutineBlock.create({
    id: EntityId.create('routine-1'),
    anchorDate: TODAY,
    title: 'Фокус',
    startTime: '08:00',
    endTime: '09:00',
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
    required: true,
    now: new Date('2026-08-01T00:00:00.000Z'),
  });
  const routineBlockRepository = new InMemoryRoutineBlockRepository();
  await routineBlockRepository.save(block);
  const overrideRepository = new InMemoryRoutineOccurrenceOverrideRepository(
    options.override === undefined ? [] : [options.override],
  );
  const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository();
  const dayRepository = new FakeDayRepository();
  const day = Day.openCurrent({
    id: EntityId.create(`day-${currentDate.toString()}`),
    currentDate,
    occurredAt: now,
    createdEventId: EntityId.create('day-created'),
    openedEventId: EntityId.create('day-opened'),
  });
  if (options.completedDay) {
    day.complete(now, EntityId.create('day-completed'), 'Итог');
  }
  dayRepository.seed(day);
  const clock = new FakeClock(now);
  const dependencies = {
    routineBlockRepository,
    overrideRepository,
    executionRepository,
    dayRepository,
    currentDateProvider: new FakeCurrentDateProvider(currentDate),
    clock,
    idGenerator: new FakeIdGenerator('execution'),
  };
  return {
    block,
    clock,
    currentDateProvider: dependencies.currentDateProvider,
    executionRepository,
    start: new StartRoutineOccurrence(dependencies),
    complete: new CompleteRoutineOccurrence(dependencies),
    abandon: new AbandonRoutineOccurrence(dependencies),
  };
}

function input(block: RoutineBlock, effectiveDate = TODAY) {
  return { routineBlockId: block.id, occurrenceDate: TODAY, effectiveDate };
}

describe('routine execution commands', () => {
  it('starts a separate fact without changing RoutineBlock', async () => {
    const app = await setup();
    const result = await app.start.execute(input(app.block));
    expect(result).toMatchObject({
      ok: true,
      value: { status: 'running', actualStartedAt: new Date('2026-08-08T08:12:00.000Z') },
    });
    expect(app.block).toMatchObject({ startTime: '08:00', endTime: '09:00', version: 1 });
  });

  it('completes and abandons running facts atomically', async () => {
    const completedApp = await setup();
    const started = await completedApp.start.execute(input(completedApp.block));
    if (!started.ok) throw started.error;
    completedApp.clock.setTime(new Date('2026-08-08T08:52:00.000Z'));
    expect(
      await completedApp.complete.execute({
        ...input(completedApp.block),
        expectedVersion: started.value.version,
      }),
    ).toMatchObject({ ok: true, value: { status: 'completed', version: 2 } });

    const abandonedApp = await setup();
    const abandonedStart = await abandonedApp.start.execute(input(abandonedApp.block));
    if (!abandonedStart.ok) throw abandonedStart.error;
    abandonedApp.clock.setTime(new Date('2026-08-08T08:30:00.000Z'));
    expect(
      await abandonedApp.abandon.execute({
        ...input(abandonedApp.block),
        expectedVersion: abandonedStart.value.version,
      }),
    ).toMatchObject({ ok: true, value: { status: 'abandoned', version: 2 } });
  });

  it('does not create a fact for a skipped plan', async () => {
    const source = await setup();
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('skip'),
      routineBlockId: source.block.id,
      occurrenceDate: TODAY,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped,
      now: new Date('2026-08-08T07:00:00.000Z'),
    });
    const app = await setup({ override });
    expect(await app.start.execute(input(app.block))).toMatchObject({
      ok: false,
      error: { code: 'routine_execution.plan_not_startable' },
    });
    expect(await app.executionRepository.findAll()).toHaveLength(0);
  });

  it('denies the rescheduled source and starts the one target occurrence', async () => {
    const source = await setup();
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('reschedule'),
      routineBlockId: source.block.id,
      occurrenceDate: TODAY,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      targetDate: TOMORROW,
      targetStartTime: '10:00',
      now: new Date('2026-08-08T07:00:00.000Z'),
    });
    const sourceApp = await setup({ override });
    expect(await sourceApp.start.execute(input(sourceApp.block))).toMatchObject({
      ok: false,
      error: { code: 'routine_execution.plan_not_startable' },
    });

    const targetApp = await setup({
      currentDate: TOMORROW,
      override,
      now: new Date('2026-08-09T10:05:00.000Z'),
    });
    expect(await targetApp.start.execute(input(targetApp.block, TOMORROW))).toMatchObject({
      ok: true,
      value: { occurrenceDate: TODAY },
    });
    expect(await targetApp.executionRepository.findAll()).toHaveLength(1);
  });

  it('allows only one running occurrence and makes double start idempotent', async () => {
    const app = await setup();
    const double = await Promise.all([
      app.start.execute(input(app.block)),
      app.start.execute(input(app.block)),
    ]);
    expect(double.every((result) => result.ok)).toBe(true);
    expect(await app.executionRepository.findAll()).toHaveLength(1);

    const otherBlock = RoutineBlock.create({
      id: EntityId.create('routine-2'),
      anchorDate: TODAY,
      title: 'Второй блок',
      startTime: '09:00',
      endTime: '10:00',
      category: ROUTINE_BLOCK_CATEGORY.work,
      recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
      required: false,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });
    await app.start.dependencies.routineBlockRepository.save(otherBlock);
    expect(
      await app.start.execute({
        routineBlockId: otherBlock.id,
        occurrenceDate: TODAY,
        effectiveDate: TODAY,
      }),
    ).toMatchObject({ ok: false, error: { code: 'routine_execution.another_running' } });
  });

  it('protects double complete and stale versions from rewriting actualEndedAt', async () => {
    const app = await setup();
    const started = await app.start.execute(input(app.block));
    if (!started.ok) throw started.error;
    app.clock.setTime(new Date('2026-08-08T08:52:00.000Z'));
    const commandInput = { ...input(app.block), expectedVersion: started.value.version };
    const results = await Promise.all([
      app.complete.execute(commandInput),
      app.complete.execute(commandInput),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const stored = await app.executionRepository.findByOccurrence(app.block.id, TODAY);
    expect(stored?.actualEndedAt).toEqual(new Date('2026-08-08T08:52:00.000Z'));
    expect(stored?.version).toBe(2);
  });

  it('keeps past and completed days read-only', async () => {
    const app = await setup();
    const yesterday = DayDate.create('2026-08-07');
    expect(
      await app.start.execute({ ...input(app.block), effectiveDate: yesterday }),
    ).toMatchObject({ ok: false, error: { code: 'routine_execution.past_date' } });
    const completed = await setup({ completedDay: true });
    expect(await completed.start.execute(input(completed.block))).toMatchObject({
      ok: false,
      error: { code: 'routine_execution.completed_day' },
    });
  });

  it.each(['complete', 'abandon'] as const)(
    'allows %s recovery on the next calendar date and only changes the execution fact',
    async (kind) => {
      const app = await setup();
      const started = await app.start.execute(input(app.block));
      if (!started.ok) throw started.error;
      app.currentDateProvider.setCurrentDate(TOMORROW);
      app.clock.setTime(new Date('2026-08-09T00:20:00.000Z'));

      const result = await app[kind].execute({
        ...input(app.block),
        expectedVersion: started.value.version,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          status: kind === 'complete' ? 'completed' : 'abandoned',
          actualEndedAt: new Date('2026-08-09T00:20:00.000Z'),
        },
      });
      expect(app.block).toMatchObject({ startTime: '08:00', endTime: '09:00', version: 1 });
    },
  );
});
