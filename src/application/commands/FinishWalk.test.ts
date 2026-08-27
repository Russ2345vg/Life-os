import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_EXECUTION_STATUS,
  RoutineOccurrenceExecution,
  WALK_LINKED_ENTITY_TYPE,
  WALK_MODE,
  WALK_RETURN_ORIGIN,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  type WalkRoutineOccurrenceReference,
} from '../../domain';
import {
  InMemoryRoutineOccurrenceExecutionRepository,
  InMemoryWalkRepository,
} from '../../infrastructure';
import { DomainError } from '../../shared/errors/DomainError';
import { FakeClock } from '../../test/helpers/Fakes';
import type {
  FinishRoutineWalkCommitInput,
  RoutineWalkUnitOfWork,
  StartRoutineWalkCommitInput,
} from '../ports/RoutineWalkUnitOfWork';
import { AbandonWalk } from './AbandonWalk';
import { CompleteWalk } from './CompleteWalk';
import { UpdateWalkPhoto } from './UpdateWalkPhoto';

const DATE = DayDate.create('2026-08-08');
const STARTED_AT = new Date('2026-08-08T08:00:00.000Z');
const ENDED_AT = new Date('2026-08-08T08:27:15.000Z');
const PHOTO = { dataUrl: 'data:image/jpeg;base64,AQID', mimeType: 'image/jpeg', sizeBytes: 3 };
const ROUTINE_BLOCK_ID = EntityId.create('routine-walk-finish');
const ROUTINE_SOURCE = {
  routineBlockId: ROUTINE_BLOCK_ID,
  occurrenceDate: DATE,
  effectiveDate: DATE,
} satisfies WalkRoutineOccurrenceReference;

class RecordingRoutineWalkUnitOfWork implements RoutineWalkUnitOfWork {
  public readonly finishes: FinishRoutineWalkCommitInput[] = [];
  public finishError: DomainError | null = null;

  public async start(input: StartRoutineWalkCommitInput): Promise<Walk> {
    return input.walk;
  }

  public async finish(input: FinishRoutineWalkCommitInput): Promise<void> {
    if (this.finishError !== null) throw this.finishError;
    this.finishes.push(input);
  }
}

describe('walk finishing commands', () => {
  it('completes a running walk with the real clock timestamp and optional result', async () => {
    const running = createRunning('complete');
    const repository = new InMemoryWalkRepository([running]);
    const result = await new CompleteWalk(repository, new FakeClock(ENDED_AT)).execute({
      walkId: running.id,
      result: '  Хорошо проветрил голову. ',
      photo: PHOTO,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.completed, result: 'Хорошо проветрил голову.', photo: PHOTO },
    });
    if (!result.ok) throw result.error;
    expect(result.value.startedAt).toEqual(STARTED_AT);
    expect(result.value.endedAt).toEqual(ENDED_AT);
    expect(result.value.actualDurationMilliseconds).toBe(27 * 60 * 1000 + 15 * 1000);
  });

  it('completes and persists a paused walk with the open pause closed at the clock timestamp', async () => {
    const paused = createRunning('complete-paused').pause(new Date('2026-08-08T08:10:00.000Z'));
    const repository = new InMemoryWalkRepository([paused]);

    const result = await new CompleteWalk(repository, new FakeClock(ENDED_AT)).execute({
      walkId: paused.id,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.completed, pausedAt: null, endedAt: ENDED_AT },
    });
    if (!result.ok) throw result.error;
    expect(result.value.pauseIntervals[0]?.endedAt).toEqual(ENDED_AT);
    expect((await repository.findById(paused.id))?.status).toBe(WALK_STATUS.completed);
  });

  it('rejects completion of a planned or already completed walk', async () => {
    const planned = Walk.create({
      id: EntityId.create('walk-planned'),
      date: DATE,
      type: WALK_TYPE.physical,
      now: new Date('2026-08-08T07:00:00.000Z'),
    });
    const completed = createRunning('already-completed').complete({ endedAt: ENDED_AT });
    const repository = new InMemoryWalkRepository([planned, completed]);
    const command = new CompleteWalk(repository, new FakeClock(new Date('2026-08-08T09:00:00Z')));

    expect(await command.execute({ walkId: planned.id })).toMatchObject({
      ok: false,
      error: { code: 'walk.cannot_complete' },
    });
    const repeated = await command.execute({ walkId: completed.id });
    expect(repeated).toMatchObject({ ok: false, error: { code: 'walk.cannot_complete' } });
    expect((await repository.findById(completed.id))?.endedAt).toEqual(ENDED_AT);
  });

  it('atomically permits only one concurrent completion', async () => {
    const running = createRunning('double-complete');
    const repository = new InMemoryWalkRepository([running]);
    const command = new CompleteWalk(repository, new FakeClock(ENDED_AT));

    const results = await Promise.all([
      command.execute({ walkId: running.id, result: 'Первый итог' }),
      command.execute({ walkId: running.id, result: 'Второй итог' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect((await repository.findById(running.id))?.endedAt).toEqual(ENDED_AT);
  });

  it('abandons once and persists the actual end timestamp', async () => {
    const running = createRunning('abandon');
    const repository = new InMemoryWalkRepository([running]);
    const command = new AbandonWalk(repository, new FakeClock(ENDED_AT));

    expect(await command.execute({ walkId: running.id })).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.abandoned, endedAt: ENDED_AT },
    });
    expect(await command.execute({ walkId: running.id })).toMatchObject({
      ok: false,
      error: { code: 'walk.cannot_abandon' },
    });
  });

  it('abandons and persists a paused walk with the open pause closed', async () => {
    const paused = createRunning('abandon-paused').pause(new Date('2026-08-08T08:10:00.000Z'));
    const repository = new InMemoryWalkRepository([paused]);

    const result = await new AbandonWalk(repository, new FakeClock(ENDED_AT)).execute({
      walkId: paused.id,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.abandoned, pausedAt: null, endedAt: ENDED_AT },
    });
    if (!result.ok) throw result.error;
    expect(result.value.pauseIntervals[0]?.endedAt).toEqual(ENDED_AT);
    expect((await repository.findById(paused.id))?.status).toBe(WALK_STATUS.abandoned);
  });

  it('atomically completes a routine-linked Walk and its exact execution', async () => {
    const running = createRoutineRunning('routine-complete');
    const execution = createRoutineExecution('routine-complete-execution');
    const repository = new InMemoryWalkRepository([running]);
    const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository([execution]);
    const unitOfWork = new RecordingRoutineWalkUnitOfWork();

    const result = await new CompleteWalk(repository, new FakeClock(ENDED_AT), {
      executionRepository,
      unitOfWork,
    }).execute({ walkId: running.id, result: 'Стало яснее.' });

    expect(result).toMatchObject({
      ok: true,
      value: { status: WALK_STATUS.completed, endedAt: ENDED_AT, result: 'Стало яснее.' },
    });
    expect(unitOfWork.finishes).toHaveLength(1);
    expect(unitOfWork.finishes[0]).toMatchObject({
      expectedWalkVersion: running.version,
      expectedExecutionVersion: execution.version,
      terminalStatus: WALK_STATUS.completed,
      walk: { status: WALK_STATUS.completed, endedAt: ENDED_AT },
      execution: {
        status: ROUTINE_EXECUTION_STATUS.completed,
        actualEndedAt: ENDED_AT,
      },
    });
  });

  it('atomically abandons a paused routine-linked Walk without Outcome or Reentry', async () => {
    const paused = createRoutineRunning('routine-abandon').pause(
      new Date('2026-08-08T08:10:00.000Z'),
    );
    const execution = createRoutineExecution('routine-abandon-execution');
    const repository = new InMemoryWalkRepository([paused]);
    const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository([execution]);
    const unitOfWork = new RecordingRoutineWalkUnitOfWork();

    const result = await new AbandonWalk(repository, new FakeClock(ENDED_AT), {
      executionRepository,
      unitOfWork,
    }).execute({ walkId: paused.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: WALK_STATUS.abandoned,
        endedAt: ENDED_AT,
        pausedAt: null,
        afterState: null,
        reentry: null,
      },
    });
    expect(unitOfWork.finishes[0]).toMatchObject({
      expectedWalkVersion: paused.version,
      expectedExecutionVersion: execution.version,
      terminalStatus: WALK_STATUS.abandoned,
      execution: {
        status: ROUTINE_EXECUTION_STATUS.abandoned,
        actualEndedAt: ENDED_AT,
      },
    });
  });

  it.each([
    [WALK_STATUS.completed, 'complete'],
    [WALK_STATUS.abandoned, 'abandon'],
  ] as const)(
    'accepts an already %s execution while atomically finishing an active Walk',
    async (terminalStatus, commandKind) => {
      const running = createRoutineRunning(`execution-already-${terminalStatus}`);
      const startedExecution = createRoutineExecution(`execution-already-${terminalStatus}`);
      const execution =
        terminalStatus === WALK_STATUS.completed
          ? startedExecution.complete(new Date('2026-08-08T08:20:00.000Z'))
          : startedExecution.abandon(new Date('2026-08-08T08:20:00.000Z'));
      const repository = new InMemoryWalkRepository([running]);
      const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository([execution]);
      const unitOfWork = new RecordingRoutineWalkUnitOfWork();
      const routine = { executionRepository, unitOfWork };

      const result =
        commandKind === 'complete'
          ? await new CompleteWalk(repository, new FakeClock(ENDED_AT), routine).execute({
              walkId: running.id,
            })
          : await new AbandonWalk(repository, new FakeClock(ENDED_AT), routine).execute({
              walkId: running.id,
            });

      expect(result).toMatchObject({ ok: true, value: { status: terminalStatus } });
      expect(unitOfWork.finishes[0]?.execution).toBe(execution);
    },
  );

  it.each([
    [WALK_STATUS.completed, 'complete'],
    [WALK_STATUS.abandoned, 'abandon'],
  ] as const)(
    'makes repeated routine-linked %s idempotent after both aggregates are terminal',
    async (terminalStatus, commandKind) => {
      const active = createRoutineRunning(`repeated-${terminalStatus}`);
      const terminalWalk =
        terminalStatus === WALK_STATUS.completed
          ? active.complete({ endedAt: ENDED_AT })
          : active.abandon(ENDED_AT);
      const startedExecution = createRoutineExecution(`repeated-${terminalStatus}`);
      const terminalExecution =
        terminalStatus === WALK_STATUS.completed
          ? startedExecution.complete(ENDED_AT)
          : startedExecution.abandon(ENDED_AT);
      const repository = new InMemoryWalkRepository([terminalWalk]);
      const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository([
        terminalExecution,
      ]);
      const unitOfWork = new RecordingRoutineWalkUnitOfWork();
      const routine = { executionRepository, unitOfWork };

      const result =
        commandKind === 'complete'
          ? await new CompleteWalk(
              repository,
              new FakeClock(new Date('2026-08-08T09:00:00Z')),
              routine,
            ).execute({
              walkId: terminalWalk.id,
            })
          : await new AbandonWalk(
              repository,
              new FakeClock(new Date('2026-08-08T09:00:00Z')),
              routine,
            ).execute({
              walkId: terminalWalk.id,
            });

      expect(result).toEqual({ ok: true, value: terminalWalk });
      expect(unitOfWork.finishes[0]).toMatchObject({
        walk: terminalWalk,
        execution: terminalExecution,
        expectedWalkVersion: terminalWalk.version,
        expectedExecutionVersion: terminalExecution.version,
        terminalStatus,
      });
    },
  );

  it('rejects opposite terminal intents without calling the unit of work', async () => {
    const running = createRoutineRunning('opposite-terminal');
    const execution = createRoutineExecution('opposite-terminal-execution').abandon(ENDED_AT);
    const repository = new InMemoryWalkRepository([running]);
    const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository([execution]);
    const unitOfWork = new RecordingRoutineWalkUnitOfWork();

    await expect(
      new CompleteWalk(repository, new FakeClock(ENDED_AT), {
        executionRepository,
        unitOfWork,
      }).execute({ walkId: running.id }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_walk.terminal_conflict' },
    });
    expect(unitOfWork.finishes).toHaveLength(0);
  });

  it('rejects a missing source execution and propagates a unit-of-work version conflict', async () => {
    const running = createRoutineRunning('missing-execution');
    const repository = new InMemoryWalkRepository([running]);
    const emptyExecutions = new InMemoryRoutineOccurrenceExecutionRepository();
    const missingUnitOfWork = new RecordingRoutineWalkUnitOfWork();
    await expect(
      new CompleteWalk(repository, new FakeClock(ENDED_AT), {
        executionRepository: emptyExecutions,
        unitOfWork: missingUnitOfWork,
      }).execute({ walkId: running.id }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_walk.source_changed' },
    });

    const execution = createRoutineExecution('conflicting-execution');
    const conflictingUnitOfWork = new RecordingRoutineWalkUnitOfWork();
    conflictingUnitOfWork.finishError = new DomainError(
      'routine_walk.version_conflict',
      'Данные изменились.',
    );
    await expect(
      new CompleteWalk(repository, new FakeClock(ENDED_AT), {
        executionRepository: new InMemoryRoutineOccurrenceExecutionRepository([execution]),
        unitOfWork: conflictingUnitOfWork,
      }).execute({ walkId: running.id }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'routine_walk.version_conflict' },
    });
  });

  it('never falls back to a non-atomic repository update for routine-linked Walks', async () => {
    const running = createRoutineRunning('missing-routine-dependencies');
    const repository = new InMemoryWalkRepository([running]);

    const result = await new CompleteWalk(repository, new FakeClock(ENDED_AT)).execute({
      walkId: running.id,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'persistence.transaction_failed' },
    });
    expect(await repository.findById(running.id)).toBe(running);
  });

  it('replaces and removes the one photo without changing completion timestamps', async () => {
    const completed = createRunning('photo').complete({ endedAt: ENDED_AT, photo: PHOTO });
    const repository = new InMemoryWalkRepository([completed]);
    const command = new UpdateWalkPhoto(
      repository,
      new FakeClock(new Date('2026-08-08T09:00:00.000Z')),
    );
    const replacement = {
      dataUrl: 'data:image/png;base64,BAUG',
      mimeType: 'image/png',
      sizeBytes: 3,
    };

    expect(await command.execute({ walkId: completed.id, photo: replacement })).toMatchObject({
      ok: true,
      value: { photo: replacement },
    });
    const removed = await command.execute({ walkId: completed.id, photo: null });
    expect(removed).toMatchObject({ ok: true, value: { photo: null } });
    if (!removed.ok) throw removed.error;
    expect(removed.value.startedAt).toEqual(STARTED_AT);
    expect(removed.value.endedAt).toEqual(ENDED_AT);
  });
});

function createRunning(id: string): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    now: new Date('2026-08-08T07:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: STARTED_AT,
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}

function createRoutineRunning(id: string): Walk {
  const linkedEntity = {
    type: WALK_LINKED_ENTITY_TYPE.routine,
    id: ROUTINE_BLOCK_ID,
  } as const;
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    linkedEntity,
    returnContext: {
      origin: WALK_RETURN_ORIGIN.routine,
      entity: linkedEntity,
      nextStep: null,
      routineContext: {
        source: ROUTINE_SOURCE,
        sourceTitle: 'Прогулка',
        next: null,
      },
    },
    now: new Date('2026-08-08T07:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: STARTED_AT,
    reflectionQuestion: 'Что сейчас важно заметить?',
  });
}

function createRoutineExecution(id: string): RoutineOccurrenceExecution {
  return RoutineOccurrenceExecution.start({
    id: EntityId.create(id),
    routineBlockId: ROUTINE_BLOCK_ID,
    occurrenceDate: DATE,
    occurredAt: STARTED_AT,
  });
}
