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
  type WalkRehydrationData,
} from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { GetPendingWalkReentry } from './GetPendingWalkReentry';

describe('GetPendingWalkReentry', () => {
  it('returns the newest Reentry-bearing Walk when it is pending', async () => {
    const older = pendingWalk('older', new Date('2026-08-25T09:30:00.000Z'));
    const latest = pendingWalk('latest', new Date('2026-08-25T10:30:00.000Z'));
    const query = new GetPendingWalkReentry(new InMemoryWalkRepository([latest, older]));

    await expect(query.execute()).resolves.toBe(latest);
  });

  it('does not resurface an older pending Reentry after the newest one is resolved', async () => {
    const olderPending = pendingWalk('older-pending', new Date('2026-08-25T09:30:00.000Z'));
    const latestClosed = pendingWalk(
      'latest-closed',
      new Date('2026-08-25T10:30:00.000Z'),
    ).closeReentry(new Date('2026-08-25T10:31:00.000Z'));
    const query = new GetPendingWalkReentry(
      new InMemoryWalkRepository([olderPending, latestClosed]),
    );

    await expect(query.execute()).resolves.toBeNull();
  });

  it('breaks equal preparedAt ties by updatedAt descending', async () => {
    const preparedAt = new Date('2026-08-25T10:30:00.000Z');
    const olderUpdate = pendingWalk('older-update', preparedAt);
    const newerUpdate = withUpdatedAt(
      pendingWalk('newer-update', preparedAt),
      new Date('2026-08-25T10:35:00.000Z'),
    );
    const query = new GetPendingWalkReentry(new InMemoryWalkRepository([olderUpdate, newerUpdate]));

    await expect(query.execute()).resolves.toBe(newerUpdate);
  });

  it('breaks equal timestamp ties by id descending', async () => {
    const preparedAt = new Date('2026-08-25T10:30:00.000Z');
    const alpha = pendingWalk('alpha', preparedAt);
    const beta = pendingWalk('beta', preparedAt);
    const query = new GetPendingWalkReentry(new InMemoryWalkRepository([alpha, beta]));

    await expect(query.execute()).resolves.toBe(beta);
    expect(beta.reentry?.status).toBe(WALK_REENTRY_STATUS.pending);
  });
});

function pendingWalk(id: string, preparedAt: Date): Walk {
  const endedAt = new Date(preparedAt.getTime() - 60_000);
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DayDate.create('2026-08-25'),
    type: WALK_TYPE.reflection,
    now: new Date(endedAt.getTime() - 32 * 60_000),
  })
    .start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date(endedAt.getTime() - 30 * 60_000),
      reflectionQuestion: 'Что сейчас важно заметить?',
    })
    .complete({ endedAt })
    .recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reentryAction: {
        kind: WALK_REENTRY_ACTION_KIND.today,
        destination: WALK_RETURN_ORIGIN.today,
        entity: null,
        nextStep: null,
      },
      updatedAt: preparedAt,
    });
}

function withUpdatedAt(walk: Walk, updatedAt: Date): Walk {
  const data: WalkRehydrationData = {
    id: walk.id,
    date: walk.date,
    type: walk.type,
    sphereId: walk.sphereId,
    intent: walk.intent,
    reflectionTemplate: walk.reflectionTemplate,
    reflectionStage: walk.reflectionStage,
    beforeState: walk.beforeState,
    afterState: walk.afterState,
    impact: walk.impact,
    linkedEntity: walk.linkedEntity,
    returnContext: walk.returnContext,
    reentry: walk.reentry,
    status: walk.status,
    mode: walk.mode,
    startedAt: walk.startedAt,
    pausedAt: walk.pausedAt,
    pauseIntervals: walk.pauseIntervals,
    endedAt: walk.endedAt,
    timerTargetMinutes: walk.timerTargetMinutes,
    reflectionQuestion: walk.reflectionQuestion,
    result: walk.result,
    photo: walk.photo,
    createdAt: walk.createdAt,
    updatedAt,
    version: walk.version,
  };
  return Walk.rehydrate(data);
}
