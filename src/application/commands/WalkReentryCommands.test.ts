import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_IMPACT,
  WALK_MODE,
  WALK_REENTRY_ACTION_KIND,
  WALK_REENTRY_STATUS,
  WALK_RETURN_ORIGIN,
  WALK_TYPE,
  Walk,
} from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { FakeClock } from '../../test/helpers/Fakes';
import { CloseWalkReentry } from './CloseWalkReentry';
import { CompleteWalkReentry } from './CompleteWalkReentry';

const NOW = new Date('2026-08-25T10:35:00.000Z');

describe('Walk Reentry commands', () => {
  it('completes a pending Reentry with one optimistic update', async () => {
    const pending = pendingWalk('complete');
    const repository = new RecordingWalkRepository([pending]);
    const command = new CompleteWalkReentry(repository, new FakeClock(NOW));

    const result = await command.execute({ walkId: pending.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: pending.status,
        endedAt: pending.endedAt,
        impact: pending.impact,
        result: pending.result,
        version: pending.version + 1,
        reentry: {
          status: WALK_REENTRY_STATUS.completed,
          resolvedAt: NOW,
        },
      },
    });
    expect(repository.findCalls).toBe(1);
    expect(repository.updateCalls).toBe(1);
  });

  it('closes a pending Reentry without continuation', async () => {
    const pending = pendingWalk('close');
    const repository = new RecordingWalkRepository([pending]);
    const command = new CloseWalkReentry(repository, new FakeClock(NOW));

    const result = await command.execute({ walkId: pending.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: pending.version + 1,
        reentry: {
          status: WALK_REENTRY_STATUS.closedWithoutContinuation,
          resolvedAt: NOW,
        },
      },
    });
    expect(repository.findCalls).toBe(1);
    expect(repository.updateCalls).toBe(1);
  });

  it('rejects missing and non-pending Reentry without an update', async () => {
    const completedWithoutOutcome = completedWalk('without-reentry');
    const repository = new RecordingWalkRepository([completedWithoutOutcome]);
    const command = new CompleteWalkReentry(repository, new FakeClock(NOW));

    await expect(
      command.execute({ walkId: EntityId.create('walk-missing-reentry-command') }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'walk.not_found' } });
    await expect(command.execute({ walkId: completedWithoutOutcome.id })).resolves.toMatchObject({
      ok: false,
      error: { code: 'walk.reentry_not_pending' },
    });
    expect(repository.updateCalls).toBe(0);
  });

  it('rejects a repeated resolution and an optimistic conflict', async () => {
    const pending = pendingWalk('repeat');
    const repository = new RecordingWalkRepository([pending]);
    const command = new CloseWalkReentry(repository, new FakeClock(NOW));

    await expect(command.execute({ walkId: pending.id })).resolves.toMatchObject({ ok: true });
    await expect(command.execute({ walkId: pending.id })).resolves.toMatchObject({
      ok: false,
      error: { code: 'walk.reentry_not_pending' },
    });
    expect(repository.updateCalls).toBe(1);

    const conflicting = new ConflictingWalkRepository([pendingWalk('conflict')]);
    const conflict = (await conflicting.findAll())[0]!;
    await expect(
      new CompleteWalkReentry(conflicting, new FakeClock(NOW)).execute({ walkId: conflict.id }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'walk.version_conflict' } });
  });
});

class RecordingWalkRepository extends InMemoryWalkRepository {
  public findCalls = 0;
  public updateCalls = 0;

  public override async findById(id: EntityId): Promise<Walk | null> {
    this.findCalls += 1;
    return super.findById(id);
  }

  public override async updateIfVersionMatches(
    walk: Walk,
    expectedVersion: number,
  ): Promise<boolean> {
    this.updateCalls += 1;
    return super.updateIfVersionMatches(walk, expectedVersion);
  }
}

class ConflictingWalkRepository extends InMemoryWalkRepository {
  public override async updateIfVersionMatches(): Promise<boolean> {
    return false;
  }
}

function pendingWalk(id: string): Walk {
  return completedWalk(id).recordOutcome({
    afterState: { energy: 7, tension: 2, clarity: 8 },
    impact: WALK_IMPACT.better,
    reflection: 'Стало спокойнее.',
    reentryAction: {
      kind: WALK_REENTRY_ACTION_KIND.today,
      destination: WALK_RETURN_ORIGIN.today,
      entity: null,
      nextStep: null,
    },
    updatedAt: new Date('2026-08-25T10:32:00.000Z'),
  });
}

function completedWalk(id: string): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DayDate.create('2026-08-25'),
    type: WALK_TYPE.reflection,
    now: new Date('2026-08-25T09:00:00.000Z'),
  })
    .start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-25T10:00:00.000Z'),
      reflectionQuestion: 'Что сейчас важно заметить?',
    })
    .complete({ endedAt: new Date('2026-08-25T10:30:00.000Z') });
}
