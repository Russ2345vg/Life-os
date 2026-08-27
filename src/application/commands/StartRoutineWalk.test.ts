import { describe, expect, it } from 'vitest';
import {
  DAY_STATUS,
  Day,
  DayDate,
  EntityId,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  ROUTINE_EXECUTION_STATUS,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceExecution,
  RoutineOccurrenceOverride,
  WALK_INTENT,
  WALK_LINKED_ENTITY_TYPE,
  WALK_MODE,
  WALK_REFLECTION_TEMPLATE,
  WALK_RETURN_ORIGIN,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  createRoutineBlockAssignment,
  type WalkRoutineOccurrenceReference,
} from '../../domain';
import {
  InMemoryRoutineBlockRepository,
  InMemoryRoutineOccurrenceExecutionRepository,
  InMemoryRoutineOccurrenceOverrideRepository,
  InMemoryWalkRepository,
} from '../../infrastructure';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import type {
  FinishRoutineWalkCommitInput,
  RoutineWalkUnitOfWork,
  StartRoutineWalkCommitInput,
} from '../ports/RoutineWalkUnitOfWork';
import { StartRoutineWalk, type StartRoutineWalkInput } from './StartRoutineWalk';

const DATE = DayDate.create('2026-08-25');
const YESTERDAY = DayDate.create('2026-08-24');
const TOMORROW = DayDate.create('2026-08-26');
const NOW = new Date('2026-08-25T08:05:00.000Z');

class RecordingRoutineWalkUnitOfWork implements RoutineWalkUnitOfWork {
  public readonly starts: StartRoutineWalkCommitInput[] = [];
  public readonly finishes: FinishRoutineWalkCommitInput[] = [];

  public async start(input: StartRoutineWalkCommitInput): Promise<Walk> {
    this.starts.push(input);
    return input.walk;
  }

  public async finish(input: FinishRoutineWalkCommitInput): Promise<void> {
    this.finishes.push(input);
  }
}

describe('StartRoutineWalk', () => {
  it('starts one Walk and Routine execution with one timestamp and the next visible occurrence', async () => {
    const source = routineBlock({ id: 'routine-walk', title: 'Прогулка', startTime: '08:00' });
    const hidden = routineBlock({
      id: 'routine-hidden',
      title: 'Скрытый блок',
      startTime: '09:00',
    });
    const next = routineBlock({
      id: 'routine-next',
      title: 'Завтрак',
      startTime: '10:00',
      assignment: ROUTINE_BLOCK_ASSIGNMENT.reminder,
    });
    const skipped = RoutineOccurrenceOverride.create({
      id: EntityId.create('skip-hidden'),
      routineBlockId: hidden.id,
      occurrenceDate: DATE,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped,
      now: new Date('2026-08-25T07:00:00.000Z'),
    });
    const app = await setup({ blocks: [source, hidden, next], overrides: [skipped] });

    const result = await app.command.execute({
      source: reference(source),
      intent: WALK_INTENT.recovery,
      beforeState: { energy: 3, tension: 8, clarity: 4 },
      mode: WALK_MODE.timer,
      timerTargetMinutes: 30,
      reflectionQuestion: 'Что поможет отпустить напряжение?',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        type: WALK_TYPE.restorative,
        intent: WALK_INTENT.recovery,
        status: WALK_STATUS.running,
        mode: WALK_MODE.timer,
        timerTargetMinutes: 30,
        beforeState: { energy: 3, tension: 8, clarity: 4 },
        linkedEntity: { type: WALK_LINKED_ENTITY_TYPE.routine },
        returnContext: {
          origin: WALK_RETURN_ORIGIN.routine,
          nextStep: 'Завтрак',
          routineContext: { sourceTitle: 'Прогулка' },
        },
      },
    });
    expect(app.unitOfWork.starts).toHaveLength(1);
    const commit = app.unitOfWork.starts[0]!;
    expect(commit.walk.startedAt).toEqual(NOW);
    expect(commit.execution.actualStartedAt).toEqual(NOW);
    expect(commit.execution).toMatchObject({
      routineBlockId: source.id,
      occurrenceDate: DATE,
      status: ROUTINE_EXECUTION_STATUS.running,
    });
    expect(commit.walk.returnContext?.routineContext?.next).toEqual(reference(next));
    expect(commit.plan).toEqual({
      source: reference(source),
      expectedRoutineBlockVersion: source.version,
      expectedOverrideVersion: null,
    });
    expect(commit.expectedExecutionVersion).toBeNull();
  });

  it('starts the rescheduled target using the historical occurrence reference', async () => {
    const source = routineBlock({
      id: 'routine-rescheduled',
      title: 'Перенесённая прогулка',
      startTime: '08:00',
      anchorDate: YESTERDAY,
    });
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('reschedule-walk'),
      routineBlockId: source.id,
      occurrenceDate: YESTERDAY,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      targetDate: DATE,
      targetStartTime: '11:00',
      now: new Date('2026-08-24T07:00:00.000Z'),
    });
    const app = await setup({ blocks: [source], overrides: [override] });
    const sourceReference = reference(source, YESTERDAY, DATE);

    const result = await app.command.execute(startInput(sourceReference));

    expect(result).toMatchObject({
      ok: true,
      value: {
        date: DATE,
        returnContext: {
          routineContext: { source: sourceReference, sourceTitle: 'Перенесённая прогулка' },
        },
      },
    });
    expect(app.unitOfWork.starts[0]?.plan).toEqual({
      source: sourceReference,
      expectedRoutineBlockVersion: 1,
      expectedOverrideVersion: 1,
    });
  });

  it('reuses the exact running Routine execution when no active Walk exists', async () => {
    const source = routineBlock({ id: 'routine-existing-execution', title: 'Прогулка' });
    const execution = RoutineOccurrenceExecution.start({
      id: EntityId.create('existing-execution'),
      routineBlockId: source.id,
      occurrenceDate: DATE,
      occurredAt: new Date('2026-08-25T07:55:00.000Z'),
    });
    const app = await setup({ blocks: [source], executions: [execution] });

    const result = await app.command.execute(startInput(reference(source)));

    expect(result).toMatchObject({ ok: true, value: { status: WALK_STATUS.running } });
    expect(app.unitOfWork.starts[0]?.execution).toBe(execution);
    expect(app.unitOfWork.starts[0]?.expectedExecutionVersion).toBe(execution.version);
  });

  it('returns the same active Walk for the same source without another commit', async () => {
    const source = routineBlock({ id: 'routine-idempotent', title: 'Прогулка' });
    const sourceReference = reference(source);
    const active = activeRoutineWalk(sourceReference, source.title);
    const app = await setup({ blocks: [source], walks: [active] });

    const result = await app.command.execute(startInput(sourceReference));

    expect(result).toEqual({ ok: true, value: active });
    expect(app.unitOfWork.starts).toHaveLength(0);
  });

  it('rejects a different active Walk', async () => {
    const source = routineBlock({ id: 'routine-active-conflict', title: 'Прогулка' });
    const active = Walk.create({
      id: EntityId.create('ordinary-active-walk'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-25T07:30:00.000Z'),
    }).start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-25T07:35:00.000Z'),
      reflectionQuestion: 'Что важно?',
    });
    const app = await setup({ blocks: [source], walks: [active] });

    await expect(app.command.execute(startInput(reference(source)))).resolves.toMatchObject({
      ok: false,
      error: { code: 'walk.running_exists' },
    });
    expect(app.unitOfWork.starts).toHaveLength(0);
  });

  it('rejects a different running Routine occurrence', async () => {
    const source = routineBlock({ id: 'routine-requested', title: 'Прогулка' });
    const other = routineBlock({ id: 'routine-running', title: 'Другой блок', startTime: '09:00' });
    const running = RoutineOccurrenceExecution.start({
      id: EntityId.create('other-running-execution'),
      routineBlockId: other.id,
      occurrenceDate: DATE,
      occurredAt: new Date('2026-08-25T07:55:00.000Z'),
    });
    const app = await setup({ blocks: [source, other], executions: [running] });

    await expect(app.command.execute(startInput(reference(source)))).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_walk.another_routine_running' },
    });
    expect(app.unitOfWork.starts).toHaveLength(0);
  });

  it('rejects a terminal execution for the selected source', async () => {
    const source = routineBlock({ id: 'routine-terminal', title: 'Прогулка' });
    const terminal = RoutineOccurrenceExecution.start({
      id: EntityId.create('terminal-execution'),
      routineBlockId: source.id,
      occurrenceDate: DATE,
      occurredAt: new Date('2026-08-25T07:00:00.000Z'),
    }).complete(new Date('2026-08-25T07:30:00.000Z'));
    const app = await setup({ blocks: [source], executions: [terminal] });

    await expect(app.command.execute(startInput(reference(source)))).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_walk.source_not_startable' },
    });
  });

  it.each([
    [ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped, {}],
    [
      ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      { targetDate: TOMORROW, targetStartTime: '11:00' },
    ],
    [
      ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction,
      { replacementActionId: EntityId.create('replacement-action') },
    ],
  ] as const)('rejects a %s source plan', async (type, details) => {
    const source = routineBlock({ id: `routine-${type}`, title: 'Прогулка' });
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create(`override-${type}`),
      routineBlockId: source.id,
      occurrenceDate: DATE,
      type,
      ...details,
      now: new Date('2026-08-25T07:00:00.000Z'),
    });
    const app = await setup({ blocks: [source], overrides: [override] });

    await expect(app.command.execute(startInput(reference(source)))).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_walk.source_not_startable' },
    });
  });

  it('rejects a stale source reference and a non-Walk assignment', async () => {
    const source = routineBlock({ id: 'routine-stale', title: 'Прогулка' });
    const staleApp = await setup({ blocks: [source] });
    await expect(
      staleApp.command.execute(startInput(reference(source, YESTERDAY, DATE))),
    ).resolves.toMatchObject({ ok: false, error: { code: 'routine_walk.source_changed' } });

    const reminder = routineBlock({
      id: 'routine-reminder',
      title: 'Напоминание',
      assignment: ROUTINE_BLOCK_ASSIGNMENT.reminder,
    });
    const reminderApp = await setup({ blocks: [reminder] });
    await expect(
      reminderApp.command.execute(startInput(reference(reminder))),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_walk.source_not_startable' },
    });
  });

  it('keeps closed days read-only and validates timer duration', async () => {
    const source = routineBlock({ id: 'routine-validation', title: 'Прогулка' });
    const closed = await setup({ blocks: [source], completedDay: true });
    await expect(closed.command.execute(startInput(reference(source)))).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_execution.completed_day' },
    });

    const open = await setup({ blocks: [source] });
    await expect(
      open.command.execute({
        ...startInput(reference(source)),
        mode: WALK_MODE.timer,
        timerTargetMinutes: 0,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'walk.invalid_timer_target' },
    });
    expect(open.unitOfWork.starts).toHaveLength(0);
  });

  it('coalesces a double submit into one atomic start', async () => {
    const source = routineBlock({ id: 'routine-double-submit', title: 'Прогулка' });
    const app = await setup({ blocks: [source] });
    const input = startInput(reference(source));

    const results = await Promise.all([app.command.execute(input), app.command.execute(input)]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(results[0]).toEqual(results[1]);
    expect(app.unitOfWork.starts).toHaveLength(1);
    expect(app.idGenerator.generatedCount).toBe(2);
  });
});

async function setup(options: {
  readonly blocks: readonly RoutineBlock[];
  readonly overrides?: readonly RoutineOccurrenceOverride[];
  readonly executions?: readonly RoutineOccurrenceExecution[];
  readonly walks?: readonly Walk[];
  readonly completedDay?: boolean;
}) {
  const routineBlockRepository = new InMemoryRoutineBlockRepository();
  for (const block of options.blocks) await routineBlockRepository.save(block);
  const overrideRepository = new InMemoryRoutineOccurrenceOverrideRepository(
    options.overrides ?? [],
  );
  const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository(
    options.executions ?? [],
  );
  const walkRepository = new InMemoryWalkRepository(options.walks ?? []);
  const dayRepository = new FakeDayRepository();
  const day = Day.openCurrent({
    id: EntityId.create('day-walk-start'),
    currentDate: DATE,
    occurredAt: new Date('2026-08-25T06:00:00.000Z'),
    createdEventId: EntityId.create('day-walk-start-created'),
    openedEventId: EntityId.create('day-walk-start-opened'),
  });
  if (options.completedDay) {
    day.complete(
      new Date('2026-08-25T07:00:00.000Z'),
      EntityId.create('day-walk-start-completed'),
      'День закрыт',
    );
    expect(day.status).toBe(DAY_STATUS.completed);
  }
  dayRepository.seed(day);
  const unitOfWork = new RecordingRoutineWalkUnitOfWork();
  const idGenerator = new FakeIdGenerator('routine-walk-start');
  const command = new StartRoutineWalk({
    routineBlockRepository,
    overrideRepository,
    executionRepository,
    walkRepository,
    dayRepository,
    currentDateProvider: new FakeCurrentDateProvider(DATE),
    clock: new FakeClock(NOW),
    idGenerator,
    unitOfWork,
  });
  return { command, executionRepository, idGenerator, unitOfWork, walkRepository };
}

function routineBlock(options: {
  readonly id: string;
  readonly title: string;
  readonly startTime?: string;
  readonly anchorDate?: DayDate;
  readonly assignment?: (typeof ROUTINE_BLOCK_ASSIGNMENT)[keyof typeof ROUTINE_BLOCK_ASSIGNMENT];
}): RoutineBlock {
  const startTime = options.startTime ?? '08:00';
  const assignment = options.assignment ?? ROUTINE_BLOCK_ASSIGNMENT.walk;
  return RoutineBlock.create({
    id: EntityId.create(options.id),
    anchorDate: options.anchorDate ?? DATE,
    title: options.title,
    startTime,
    endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    category: ROUTINE_BLOCK_CATEGORY.physical,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
    required: true,
    assignment: createRoutineBlockAssignment(assignment),
    now: new Date('2026-08-20T08:00:00.000Z'),
  });
}

function reference(
  block: RoutineBlock,
  occurrenceDate = DATE,
  effectiveDate = DATE,
): WalkRoutineOccurrenceReference {
  return { routineBlockId: block.id, occurrenceDate, effectiveDate };
}

function startInput(source: WalkRoutineOccurrenceReference): StartRoutineWalkInput {
  return {
    source,
    intent: WALK_INTENT.reflection,
    reflectionTemplate: WALK_REFLECTION_TEMPLATE.freeThought,
    mode: WALK_MODE.stopwatch,
    reflectionQuestion: 'Что сейчас важно заметить?',
  };
}

function activeRoutineWalk(source: WalkRoutineOccurrenceReference, sourceTitle: string): Walk {
  const linkedEntity = {
    type: WALK_LINKED_ENTITY_TYPE.routine,
    id: source.routineBlockId,
  } as const;
  return Walk.create({
    id: EntityId.create('active-routine-walk'),
    date: source.effectiveDate,
    type: WALK_TYPE.reflection,
    intent: WALK_INTENT.reflection,
    reflectionTemplate: WALK_REFLECTION_TEMPLATE.freeThought,
    linkedEntity,
    returnContext: {
      origin: WALK_RETURN_ORIGIN.routine,
      entity: linkedEntity,
      nextStep: null,
      routineContext: { source, sourceTitle, next: null },
    },
    now: new Date('2026-08-25T07:45:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: new Date('2026-08-25T07:50:00.000Z'),
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}
