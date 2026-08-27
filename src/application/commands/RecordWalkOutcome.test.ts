import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_IMPACT,
  WALK_MODE,
  WALK_REENTRY_STATUS,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  type WalkImpact,
  type WalkStateSnapshot,
} from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { FakeClock } from '../../test/helpers/Fakes';
import type { Result } from '../../shared/result/Result';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';
import * as applicationExports from '../index';

const DATE = DayDate.create('2026-08-08');
const STARTED_AT = new Date('2026-08-08T08:00:00.000Z');
const ENDED_AT = new Date('2026-08-08T08:30:00.000Z');
const OUTCOME_AT = new Date('2026-08-08T08:32:00.000Z');
const AFTER_STATE = { energy: 7, tension: 2, clarity: 8 } as const;

interface RecordWalkOutcomeInputContract {
  readonly walkId: EntityId;
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection?: string;
}

interface RecordWalkOutcomeContract {
  execute(input: RecordWalkOutcomeInputContract): Promise<Result<Walk, DomainError>>;
}

type RecordWalkOutcomeConstructor = new (
  repository: WalkRepository,
  clock: Clock,
) => RecordWalkOutcomeContract;

function commandConstructor(): RecordWalkOutcomeConstructor {
  const candidate = (applicationExports as Record<string, unknown>).RecordWalkOutcome;
  expect(typeof candidate).toBe('function');
  return candidate as RecordWalkOutcomeConstructor;
}

describe('RecordWalkOutcome', () => {
  it('persists after-state, impact and trimmed reflection without changing endedAt', async () => {
    const completed = createCompleted('record');
    const repository = new RecordingWalkRepository([completed]);
    const Command = commandConstructor();

    const result = await new Command(repository, new FakeClock(OUTCOME_AT)).execute({
      walkId: completed.id,
      afterState: AFTER_STATE,
      impact: WALK_IMPACT.better,
      reflection: '  Стало спокойнее.  ',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: WALK_STATUS.completed,
        endedAt: ENDED_AT,
        afterState: AFTER_STATE,
        impact: WALK_IMPACT.better,
        result: 'Стало спокойнее.',
        reentry: {
          status: WALK_REENTRY_STATUS.pending,
          preparedAt: OUTCOME_AT,
          resolvedAt: null,
        },
      },
    });
    await expect(repository.findById(completed.id)).resolves.toMatchObject({
      endedAt: ENDED_AT,
      afterState: AFTER_STATE,
      impact: WALK_IMPACT.better,
      result: 'Стало спокойнее.',
      reentry: {
        status: WALK_REENTRY_STATUS.pending,
        preparedAt: OUTCOME_AT,
        resolvedAt: null,
      },
    });
    expect(repository.updateCalls).toHaveLength(1);
  });

  it('rejects a missing or active walk without changing repository state', async () => {
    const running = createRunning('active');
    const repository = new InMemoryWalkRepository([running]);
    const Command = commandConstructor();
    const command = new Command(repository, new FakeClock(OUTCOME_AT));
    const input = {
      afterState: AFTER_STATE,
      impact: WALK_IMPACT.same,
    };

    await expect(
      command.execute({ walkId: EntityId.create('walk-missing'), ...input }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'walk.not_found' } });
    await expect(command.execute({ walkId: running.id, ...input })).resolves.toMatchObject({
      ok: false,
      error: { code: 'walk.outcome_requires_completed' },
    });
    expect((await repository.findById(running.id))?.status).toBe(WALK_STATUS.running);
  });

  it('rejects a repeated outcome and an optimistic version conflict', async () => {
    const completed = createCompleted('repeat');
    const repository = new InMemoryWalkRepository([completed]);
    const Command = commandConstructor();
    const command = new Command(repository, new FakeClock(OUTCOME_AT));
    const input = {
      walkId: completed.id,
      afterState: AFTER_STATE,
      impact: WALK_IMPACT.worse,
    };

    await expect(command.execute(input)).resolves.toMatchObject({ ok: true });
    await expect(command.execute(input)).resolves.toMatchObject({
      ok: false,
      error: { code: 'walk.outcome_already_recorded' },
    });

    const conflicting = new ConflictingWalkRepository([createCompleted('conflict')]);
    const conflictId = (await conflicting.findAll())[0]!.id;
    await expect(
      new Command(conflicting, new FakeClock(OUTCOME_AT)).execute({
        ...input,
        walkId: conflictId,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'walk.version_conflict' } });
  });
});

class ConflictingWalkRepository extends InMemoryWalkRepository {
  public override async updateIfVersionMatches(): Promise<boolean> {
    return false;
  }
}

class RecordingWalkRepository extends InMemoryWalkRepository {
  public readonly updateCalls: Walk[] = [];

  public override async updateIfVersionMatches(
    walk: Walk,
    expectedVersion: number,
  ): Promise<boolean> {
    this.updateCalls.push(walk);
    return super.updateIfVersionMatches(walk, expectedVersion);
  }
}

function createCompleted(id: string): Walk {
  return createRunning(id).complete({ endedAt: ENDED_AT });
}

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
