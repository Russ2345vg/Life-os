import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { Goal } from './Goal';
import { GOAL_HORIZON, isGoalHorizon } from './GoalHorizon';
import { GOAL_INTENTION_LEVEL, isGoalIntentionLevel } from './GoalIntentionLevel';
import { GOAL_PROGRESS_TYPE, GOAL_QUALITATIVE_STAGE, isGoalProgressType } from './GoalProgress';
import { GOAL_STAGE, isGoalStage } from './GoalStage';
import { GOAL_STATUS, isGoalStatus } from './GoalStatus';

const CREATED_AT = new Date('2026-08-23T08:00:00.000Z');

describe('Goal', () => {
  it('creates a minimal future idea and normalizes its title', () => {
    const goal = Goal.create({
      id: EntityId.create('goal-1'),
      title: '  Купить   дом у моря  ',
      now: CREATED_AT,
    });

    expect(goal).toMatchObject({
      title: 'Купить дом у моря',
      description: null,
      whyImportant: null,
      whyNow: null,
      status: GOAL_STATUS.future,
      stage: GOAL_STAGE.idea,
      directionId: null,
      intentionLevel: null,
      horizon: null,
      progressType: null,
      progress: null,
      achievementCriteria: null,
      nextProgress: null,
      coverImage: null,
      archivedAt: null,
      version: 1,
    });
    expect(goal.createdAt).toEqual(CREATED_AT);
    expect(goal.updatedAt).toEqual(CREATED_AT);
  });

  it('keeps an optional Direction reference through updates and archiving', () => {
    const firstDirectionId = EntityId.create('direction-first');
    const secondDirectionId = EntityId.create('direction-second');
    const goal = Goal.create({
      id: EntityId.create('goal-direction'),
      directionId: firstDirectionId,
      title: 'Цель с направлением',
      now: CREATED_AT,
    });

    const updated = goal.update(
      { title: goal.title, directionId: secondDirectionId },
      new Date('2026-08-24T08:00:00.000Z'),
    );
    const archived = updated.archive(new Date('2026-08-25T08:00:00.000Z'));

    expect(goal.directionId).toEqual(firstDirectionId);
    expect(updated.directionId).toEqual(secondDirectionId);
    expect(archived.directionId).toEqual(secondDirectionId);
  });

  it('updates supported details and keeps progress type consistent with its payload', () => {
    const goal = Goal.create({
      id: EntityId.create('goal-2'),
      title: 'Дом',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      now: CREATED_AT,
    });
    const updatedAt = new Date('2026-08-24T09:30:00.000Z');

    const updated = goal.update(
      {
        title: 'Дом у моря',
        description: 'Светлый дом рядом с водой',
        whyImportant: 'Создать место для семьи',
        whyNow: 'Подходящий жизненный этап',
        stage: GOAL_STAGE.activeGoal,
        intentionLevel: GOAL_INTENTION_LEVEL.commit,
        horizon: GOAL_HORIZON.oneToThreeYears,
        progress: {
          type: GOAL_PROGRESS_TYPE.metric,
          current: 1_000_000,
          target: 8_000_000,
          unit: '₽',
        },
        achievementCriteria: 'Дом куплен и готов к проживанию',
        nextProgress: 'Выбрать три подходящих района',
        coverImage: {
          dataUrl: 'data:image/png;base64,AQID',
          mimeType: 'image/png',
          sizeBytes: 3,
        },
      },
      updatedAt,
    );

    expect(updated).toMatchObject({
      title: 'Дом у моря',
      description: 'Светлый дом рядом с водой',
      whyImportant: 'Создать место для семьи',
      whyNow: 'Подходящий жизненный этап',
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
      horizon: GOAL_HORIZON.oneToThreeYears,
      progressType: GOAL_PROGRESS_TYPE.metric,
      progress: { current: 1_000_000, target: 8_000_000, unit: '₽' },
      achievementCriteria: 'Дом куплен и готов к проживанию',
      nextProgress: 'Выбрать три подходящих района',
      coverImage: { mimeType: 'image/png', sizeBytes: 3 },
      version: 2,
    });
    expect(updated.updatedAt).toEqual(updatedAt);
    expect(goal.title).toBe('Дом');
  });

  it('archives once and records the archive timestamp', () => {
    const goal = Goal.create({
      id: EntityId.create('goal-3'),
      title: 'Цель для архива',
      now: CREATED_AT,
    });
    const archivedAt = new Date('2026-08-25T10:00:00.000Z');

    const archived = goal.archive(archivedAt);

    expect(archived).toMatchObject({
      status: GOAL_STATUS.archived,
      version: 2,
    });
    expect(archived.archivedAt).toEqual(archivedAt);
    expect(archived.archive(new Date('2026-08-26T10:00:00.000Z'))).toBe(archived);
  });

  it.each([
    [isGoalStatus, Object.values(GOAL_STATUS)],
    [isGoalStage, Object.values(GOAL_STAGE)],
    [isGoalIntentionLevel, Object.values(GOAL_INTENTION_LEVEL)],
    [isGoalHorizon, Object.values(GOAL_HORIZON)],
    [isGoalProgressType, Object.values(GOAL_PROGRESS_TYPE)],
  ] as const)('accepts every declared enum value and rejects an unknown value', (guard, values) => {
    for (const value of values) expect(guard(value)).toBe(true);
    expect(guard('unknown')).toBe(false);
  });

  it('supports qualitative progress without inventing a percentage', () => {
    const goal = Goal.create({
      id: EntityId.create('goal-4'),
      title: 'Свободно говорить по-испански',
      progress: {
        type: GOAL_PROGRESS_TYPE.qualitative,
        stage: GOAL_QUALITATIVE_STAGE.moving,
      },
      now: CREATED_AT,
    });

    expect(goal.progressType).toBe(GOAL_PROGRESS_TYPE.qualitative);
    expect(goal.progress).toEqual({
      type: GOAL_PROGRESS_TYPE.qualitative,
      stage: GOAL_QUALITATIVE_STAGE.moving,
    });
    expect(goal).not.toHaveProperty('progressPercent');
  });

  it('rejects malformed runtime values with domain errors', () => {
    expectDomainError(
      () =>
        Goal.create({
          id: EntityId.create('goal-invalid-status'),
          title: 'Цель',
          status: null as never,
          now: CREATED_AT,
        }),
      'goal.invalid_initial_status',
    );
    expectDomainError(
      () =>
        Goal.create({
          id: EntityId.create('goal-invalid-stage'),
          title: 'Цель',
          stage: null as never,
          now: CREATED_AT,
        }),
      'goal.invalid_stage',
    );
    expectDomainError(
      () =>
        Goal.create({
          id: EntityId.create('goal-invalid-progress'),
          title: 'Цель',
          progress: {
            type: GOAL_PROGRESS_TYPE.metric,
            current: 1,
            target: 2,
            unit: null,
          } as never,
          now: CREATED_AT,
        }),
      'goal.invalid_metric_progress',
    );
    expectDomainError(
      () =>
        Goal.create({
          id: EntityId.create('goal-invalid-cover'),
          title: 'Цель',
          coverImage: {
            dataUrl: 'data:image/png;base64,AQID',
            mimeType: null,
            sizeBytes: 3,
          } as never,
          now: CREATED_AT,
        }),
      'goal.invalid_cover_image_type',
    );
  });

  it('changes achieved status and stage atomically while keeping other status-stage pairs independent', () => {
    const futureActiveGoal = Goal.create({
      id: EntityId.create('goal-future-active'),
      title: 'Будущая активная цель',
      stage: GOAL_STAGE.activeGoal,
      now: CREATED_AT,
    });
    expect(futureActiveGoal).toMatchObject({
      status: GOAL_STATUS.future,
      stage: GOAL_STAGE.activeGoal,
    });

    expectDomainError(
      () =>
        futureActiveGoal.update(
          { title: futureActiveGoal.title, stage: GOAL_STAGE.achieved },
          new Date('2026-08-24T08:00:00.000Z'),
        ),
      'goal.achieved_status_required',
    );

    const achieved = futureActiveGoal.update(
      {
        title: futureActiveGoal.title,
        status: GOAL_STATUS.achieved,
        stage: GOAL_STAGE.achieved,
      },
      new Date('2026-08-24T08:00:00.000Z'),
    );
    expect(achieved).toMatchObject({
      status: GOAL_STATUS.achieved,
      stage: GOAL_STAGE.achieved,
      version: 2,
    });
  });
});

function expectDomainError(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DomainError);
    if (error instanceof DomainError) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError with code ${code}.`);
}
