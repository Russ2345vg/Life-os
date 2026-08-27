import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { StartRoutineWalkCommitInput } from '../../application';
import {
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
  WALK_LINKED_ENTITY_TYPE,
  WALK_MODE,
  WALK_RETURN_ORIGIN,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  createRoutineBlockAssignment,
  type WalkRoutineOccurrenceReference,
} from '../../domain';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbRoutineBlockRepository } from './IndexedDbRoutineBlockRepository';
import { IndexedDbRoutineOccurrenceExecutionRepository } from './IndexedDbRoutineOccurrenceExecutionRepository';
import { IndexedDbRoutineOccurrenceOverrideRepository } from './IndexedDbRoutineOccurrenceOverrideRepository';
import { IndexedDbRoutineWalkUnitOfWork } from './IndexedDbRoutineWalkUnitOfWork';
import { IndexedDbWalkRepository } from './IndexedDbWalkRepository';

const DATE = DayDate.create('2026-08-25');
const YESTERDAY = DayDate.create('2026-08-24');
const STARTED_AT = new Date('2026-08-25T08:05:00.000Z');
const ENDED_AT = new Date('2026-08-25T08:35:00.000Z');

describe('IndexedDbRoutineWalkUnitOfWork', () => {
  it('atomically starts and restores both aggregates after reopen', async () => {
    const factory = new IDBFactory();
    const first = bundle(factory);
    const block = routineBlock('routine-atomic-start');
    await first.blockRepository.save(block);

    const stored = await first.unitOfWork.start(startCommit(block));

    expect(stored).toMatchObject({ status: WALK_STATUS.running, startedAt: STARTED_AT });
    first.database.close();

    const reopened = bundle(factory);
    await expect(reopened.walkRepository.findActive()).resolves.toMatchObject({
      id: stored.id,
      status: WALK_STATUS.running,
    });
    await expect(
      reopened.executionRepository.findByOccurrence(block.id, DATE),
    ).resolves.toMatchObject({
      status: ROUTINE_EXECUTION_STATUS.running,
      actualStartedAt: STARTED_AT,
    });
    reopened.database.close();
  });

  it('validates and starts a rescheduled target against the stored override version', async () => {
    const app = bundle(new IDBFactory());
    const block = routineBlock('routine-rescheduled-start', YESTERDAY);
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('routine-rescheduled-override'),
      routineBlockId: block.id,
      occurrenceDate: YESTERDAY,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      targetDate: DATE,
      targetStartTime: '11:00',
      now: new Date('2026-08-24T07:00:00.000Z'),
    });
    await app.blockRepository.save(block);
    await app.overrideRepository.saveIfVersionMatches(override, null);
    const source = reference(block, YESTERDAY, DATE);

    const stored = await app.unitOfWork.start(startCommit(block, { source, override }));

    expect(stored.returnContext?.routineContext?.source).toEqual(source);
    expect(await app.executionRepository.findByOccurrence(block.id, YESTERDAY)).toMatchObject({
      status: ROUTINE_EXECUTION_STATUS.running,
    });
    app.database.close();
  });

  it('returns the stored same-source Walk for concurrent starts', async () => {
    const app = bundle(new IDBFactory());
    const block = routineBlock('routine-concurrent-start');
    await app.blockRepository.save(block);
    const first = startCommit(block, { suffix: 'first' });
    const second = startCommit(block, { suffix: 'second' });

    const results = await Promise.all([app.unitOfWork.start(first), app.unitOfWork.start(second)]);

    expect(results[0]!.id.equals(results[1]!.id)).toBe(true);
    expect(await app.walkRepository.findAll()).toHaveLength(1);
    expect(await app.executionRepository.findAll()).toHaveLength(1);
    app.database.close();
  });

  it('rejects another active Walk or another running Routine without partial writes', async () => {
    const activeApp = bundle(new IDBFactory());
    const source = routineBlock('routine-active-rejected');
    await activeApp.blockRepository.save(source);
    const ordinaryActive = ordinaryRunningWalk('ordinary-active');
    await activeApp.walkRepository.save(ordinaryActive);

    await expect(activeApp.unitOfWork.start(startCommit(source))).rejects.toMatchObject({
      code: 'walk.running_exists',
    });
    expect(await activeApp.executionRepository.findByOccurrence(source.id, DATE)).toBeNull();
    expect(await activeApp.walkRepository.findAll()).toHaveLength(1);
    activeApp.database.close();

    const routineApp = bundle(new IDBFactory());
    const requested = routineBlock('routine-requested');
    const other = routineBlock('routine-other');
    await routineApp.blockRepository.save(requested);
    await routineApp.blockRepository.save(other);
    const otherExecution = RoutineOccurrenceExecution.start({
      id: EntityId.create('other-running-execution'),
      routineBlockId: other.id,
      occurrenceDate: DATE,
      occurredAt: STARTED_AT,
    });
    await routineApp.executionRepository.addIfNoRunning(otherExecution);

    await expect(routineApp.unitOfWork.start(startCommit(requested))).rejects.toMatchObject({
      code: 'routine_walk.another_routine_running',
    });
    expect(await routineApp.walkRepository.findAll()).toHaveLength(0);
    expect(await routineApp.executionRepository.findAll()).toHaveLength(1);
    routineApp.database.close();
  });

  it('aborts both writes when the source block or override version changed', async () => {
    const blockApp = bundle(new IDBFactory());
    const block = routineBlock('routine-stale-block');
    await blockApp.blockRepository.save(block);
    const staleBlockCommit = startCommit(block);
    const updatedBlock = block.update(
      {
        anchorDate: block.anchorDate,
        title: 'Обновлённая прогулка',
        startTime: block.startTime,
        endTime: block.endTime,
        category: block.category,
        recurrence: block.recurrence,
        required: block.required,
        assignment: block.assignment,
      },
      new Date('2026-08-25T07:30:00.000Z'),
    );
    await blockApp.blockRepository.saveIfVersionMatches(updatedBlock, block.version);

    await expect(blockApp.unitOfWork.start(staleBlockCommit)).rejects.toMatchObject({
      code: 'routine_walk.version_conflict',
    });
    expect(await blockApp.walkRepository.findAll()).toHaveLength(0);
    expect(await blockApp.executionRepository.findAll()).toHaveLength(0);
    blockApp.database.close();

    const overrideApp = bundle(new IDBFactory());
    const overrideBlock = routineBlock('routine-stale-override');
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('delay-override'),
      routineBlockId: overrideBlock.id,
      occurrenceDate: DATE,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed,
      startTimeOverride: '09:00',
      now: new Date('2026-08-25T07:00:00.000Z'),
    });
    await overrideApp.blockRepository.save(overrideBlock);
    await overrideApp.overrideRepository.saveIfVersionMatches(override, null);
    const staleOverrideCommit = startCommit(overrideBlock, { override });
    const updatedOverride = override.replace(
      { type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed, startTimeOverride: '09:30' },
      new Date('2026-08-25T07:30:00.000Z'),
    );
    await overrideApp.overrideRepository.saveIfVersionMatches(updatedOverride, override.version);

    await expect(overrideApp.unitOfWork.start(staleOverrideCommit)).rejects.toMatchObject({
      code: 'routine_walk.version_conflict',
    });
    expect(await overrideApp.walkRepository.findAll()).toHaveLength(0);
    expect(await overrideApp.executionRepository.findAll()).toHaveLength(0);
    overrideApp.database.close();
  });

  it('rolls back a newly added execution when the Walk id violates a constraint', async () => {
    const app = bundle(new IDBFactory());
    const block = routineBlock('routine-duplicate-walk-id');
    await app.blockRepository.save(block);
    const commit = startCommit(block);
    const duplicate = Walk.create({
      id: commit.walk.id,
      date: DATE,
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-25T07:00:00.000Z'),
    });
    await app.walkRepository.save(duplicate);

    await expect(app.unitOfWork.start(commit)).rejects.toMatchObject({
      code: 'persistence.transaction_failed',
    });
    expect(await app.walkRepository.findActive()).toBeNull();
    expect(await app.executionRepository.findByOccurrence(block.id, DATE)).toBeNull();
    expect(await app.walkRepository.findById(duplicate.id)).toMatchObject({
      status: WALK_STATUS.planned,
    });
    app.database.close();
  });

  it.each([
    [WALK_STATUS.completed, ROUTINE_EXECUTION_STATUS.completed],
    [WALK_STATUS.abandoned, ROUTINE_EXECUTION_STATUS.abandoned],
  ] as const)('atomically persists %s for both aggregates', async (walkStatus, executionStatus) => {
    const factory = new IDBFactory();
    const app = bundle(factory);
    const block = routineBlock(`routine-finish-${walkStatus}`);
    await app.blockRepository.save(block);
    const startedWalk = await app.unitOfWork.start(startCommit(block));
    const startedExecution = await app.executionRepository.findByOccurrence(block.id, DATE);
    if (startedExecution === null) throw new Error('Execution was not stored');
    const finishedWalk =
      walkStatus === WALK_STATUS.completed
        ? startedWalk.complete({ endedAt: ENDED_AT })
        : startedWalk.abandon(ENDED_AT);
    const finishedExecution =
      executionStatus === ROUTINE_EXECUTION_STATUS.completed
        ? startedExecution.complete(ENDED_AT)
        : startedExecution.abandon(ENDED_AT);

    await app.unitOfWork.finish({
      walk: finishedWalk,
      expectedWalkVersion: startedWalk.version,
      execution: finishedExecution,
      expectedExecutionVersion: startedExecution.version,
      terminalStatus: walkStatus,
    });
    app.database.close();

    const reopened = bundle(factory);
    await expect(reopened.walkRepository.findById(startedWalk.id)).resolves.toMatchObject({
      status: walkStatus,
      endedAt: ENDED_AT,
    });
    await expect(
      reopened.executionRepository.findByOccurrence(block.id, DATE),
    ).resolves.toMatchObject({ status: executionStatus, actualEndedAt: ENDED_AT });
    reopened.database.close();
  });

  it('leaves both stores unchanged on opposite terminal state or version conflict', async () => {
    const oppositeApp = bundle(new IDBFactory());
    const oppositeBlock = routineBlock('routine-opposite-finish');
    await oppositeApp.blockRepository.save(oppositeBlock);
    const runningWalk = await oppositeApp.unitOfWork.start(startCommit(oppositeBlock));
    const runningExecution = await oppositeApp.executionRepository.findByOccurrence(
      oppositeBlock.id,
      DATE,
    );
    if (runningExecution === null) throw new Error('Execution was not stored');
    const abandonedExecution = runningExecution.abandon(ENDED_AT);
    await oppositeApp.executionRepository.saveIfVersionMatches(
      abandonedExecution,
      runningExecution.version,
    );
    const completedWalk = runningWalk.complete({ endedAt: ENDED_AT });
    const completedExecution = runningExecution.complete(ENDED_AT);

    await expect(
      oppositeApp.unitOfWork.finish({
        walk: completedWalk,
        expectedWalkVersion: runningWalk.version,
        execution: completedExecution,
        expectedExecutionVersion: runningExecution.version,
        terminalStatus: WALK_STATUS.completed,
      }),
    ).rejects.toMatchObject({ code: 'routine_walk.terminal_conflict' });
    expect(await oppositeApp.walkRepository.findById(runningWalk.id)).toMatchObject({
      status: WALK_STATUS.running,
    });
    expect(
      await oppositeApp.executionRepository.findByOccurrence(oppositeBlock.id, DATE),
    ).toMatchObject({ status: ROUTINE_EXECUTION_STATUS.abandoned });
    oppositeApp.database.close();

    const conflictApp = bundle(new IDBFactory());
    const conflictBlock = routineBlock('routine-version-finish');
    await conflictApp.blockRepository.save(conflictBlock);
    const originalWalk = await conflictApp.unitOfWork.start(startCommit(conflictBlock));
    const originalExecution = await conflictApp.executionRepository.findByOccurrence(
      conflictBlock.id,
      DATE,
    );
    if (originalExecution === null) throw new Error('Execution was not stored');
    const paused = originalWalk.pause(new Date('2026-08-25T08:20:00.000Z'));
    await conflictApp.walkRepository.updateIfVersionMatches(paused, originalWalk.version);

    await expect(
      conflictApp.unitOfWork.finish({
        walk: originalWalk.complete({ endedAt: ENDED_AT }),
        expectedWalkVersion: originalWalk.version,
        execution: originalExecution.complete(ENDED_AT),
        expectedExecutionVersion: originalExecution.version,
        terminalStatus: WALK_STATUS.completed,
      }),
    ).rejects.toMatchObject({ code: 'routine_walk.version_conflict' });
    expect(await conflictApp.walkRepository.findById(originalWalk.id)).toMatchObject({
      status: WALK_STATUS.paused,
    });
    expect(
      await conflictApp.executionRepository.findByOccurrence(conflictBlock.id, DATE),
    ).toMatchObject({ status: ROUTINE_EXECUTION_STATUS.running });
    conflictApp.database.close();
  });
});

function bundle(factory: IDBFactory) {
  const database = new LifeOsIndexedDb(factory);
  return {
    database,
    unitOfWork: new IndexedDbRoutineWalkUnitOfWork(database),
    blockRepository: new IndexedDbRoutineBlockRepository(database),
    overrideRepository: new IndexedDbRoutineOccurrenceOverrideRepository(database),
    executionRepository: new IndexedDbRoutineOccurrenceExecutionRepository(database),
    walkRepository: new IndexedDbWalkRepository(database),
  };
}

function routineBlock(id: string, anchorDate = DATE): RoutineBlock {
  return RoutineBlock.create({
    id: EntityId.create(id),
    anchorDate,
    title: 'Прогулка',
    startTime: '08:00',
    endTime: '09:00',
    category: ROUTINE_BLOCK_CATEGORY.physical,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
    required: true,
    assignment: createRoutineBlockAssignment(ROUTINE_BLOCK_ASSIGNMENT.walk),
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

function startCommit(
  block: RoutineBlock,
  options: {
    readonly source?: WalkRoutineOccurrenceReference;
    readonly override?: RoutineOccurrenceOverride;
    readonly suffix?: string;
  } = {},
): StartRoutineWalkCommitInput {
  const source = options.source ?? reference(block);
  const suffix = options.suffix ?? 'default';
  const linkedEntity = { type: WALK_LINKED_ENTITY_TYPE.routine, id: block.id } as const;
  const walk = Walk.create({
    id: EntityId.create(`walk-${block.id.toString()}-${suffix}`),
    date: source.effectiveDate,
    type: WALK_TYPE.mindful,
    linkedEntity,
    returnContext: {
      origin: WALK_RETURN_ORIGIN.routine,
      entity: linkedEntity,
      nextStep: null,
      routineContext: { source, sourceTitle: block.title, next: null },
    },
    now: STARTED_AT,
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: STARTED_AT,
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
  return {
    walk,
    execution: RoutineOccurrenceExecution.start({
      id: EntityId.create(`execution-${block.id.toString()}-${suffix}`),
      routineBlockId: block.id,
      occurrenceDate: source.occurrenceDate,
      occurredAt: STARTED_AT,
    }),
    expectedExecutionVersion: null,
    plan: {
      source,
      expectedRoutineBlockVersion: block.version,
      expectedOverrideVersion: options.override?.version ?? null,
    },
  };
}

function ordinaryRunningWalk(id: string): Walk {
  return Walk.create({
    id: EntityId.create(id),
    date: DATE,
    type: WALK_TYPE.mindful,
    now: new Date('2026-08-25T07:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: STARTED_AT,
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}
