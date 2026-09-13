import { describe, expect, it } from 'vitest';
import {
  Direction,
  EntityId,
  Goal,
  GOAL_HORIZON,
  GOAL_PROGRESS_TYPE,
  GOAL_QUALITATIVE_STAGE,
  GOAL_STAGE,
  GOAL_STATUS,
  Sphere,
  type DirectionRehydrationData,
  type GoalRehydrationData,
} from '../../domain';
import {
  buildGoalAlbumModel,
  groupGoalAlbumCards,
  selectGoalAlbumCards,
  type GoalAlbumSource,
} from './goalAlbumPresentation';

const CREATED_AT = new Date('2026-08-23T08:00:00.000Z');

function rehydrateGoal(
  data: Partial<GoalRehydrationData> & Pick<GoalRehydrationData, 'id' | 'title'>,
): Goal {
  return Goal.rehydrate({
    id: data.id,
    directionId: data.directionId ?? null,
    title: data.title,
    description: null,
    whyImportant: null,
    whyNow: null,
    status: data.status ?? GOAL_STATUS.future,
    stage: data.stage ?? GOAL_STAGE.idea,
    intentionLevel: null,
    horizon: data.horizon ?? null,
    progress: data.progress ?? null,
    achievementCriteria: null,
    nextProgress: data.nextProgress ?? null,
    coverImage: null,
    createdAt: CREATED_AT,
    updatedAt: data.updatedAt ?? CREATED_AT,
    archivedAt: data.archivedAt ?? null,
    version: 1,
  });
}

function rehydrateDirection(
  data: Partial<DirectionRehydrationData> & Pick<DirectionRehydrationData, 'id' | 'name'>,
): Direction {
  return Direction.rehydrate({
    id: data.id,
    sphereId: data.sphereId ?? null,
    name: data.name,
    description: null,
    strategicIntent: null,
    desiredState: null,
    inScope: null,
    outOfScope: null,
    status: data.status ?? 'active',
    isMain: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    version: 1,
  });
}

describe('goal album presentation', () => {
  it('derives status-based counts, filters, progress, and card fallbacks from the snapshot', () => {
    const sphere = Sphere.create({
      id: EntityId.create('sphere-life'),
      name: 'Жизнь',
      now: CREATED_AT,
    });
    const direction = rehydrateDirection({
      id: EntityId.create('direction-health'),
      sphereId: sphere.id,
      name: 'Здоровье',
    });
    const metric = rehydrateGoal({
      id: EntityId.create('goal-metric'),
      directionId: direction.id,
      title: 'Марафон',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      horizon: GOAL_HORIZON.withinYear,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 125, target: 100, unit: '%' },
      nextProgress: 'Пробежать 30 км',
      updatedAt: new Date('2026-08-26T08:00:00.000Z'),
    });
    const milestones = rehydrateGoal({
      id: EntityId.create('goal-milestones'),
      directionId: direction.id,
      title: 'Питание',
      progress: { type: GOAL_PROGRESS_TYPE.milestones, completed: 3, total: 6 },
      updatedAt: new Date('2026-08-25T08:00:00.000Z'),
    });
    const qualitative = rehydrateGoal({
      id: EntityId.create('goal-qualitative'),
      directionId: direction.id,
      title: 'Сон',
      status: GOAL_STATUS.achieved,
      stage: GOAL_STAGE.achieved,
      progress: { type: GOAL_PROGRESS_TYPE.qualitative, stage: GOAL_QUALITATIVE_STAGE.moving },
      updatedAt: new Date('2026-08-24T08:00:00.000Z'),
    });
    const noProgress = rehydrateGoal({
      id: EntityId.create('goal-no-progress'),
      title: 'Без направления',
      updatedAt: new Date('2026-08-23T09:00:00.000Z'),
    });
    const archived = rehydrateGoal({
      id: EntityId.create('goal-archived'),
      directionId: EntityId.create('direction-missing'),
      title: 'Архивная цель',
      status: GOAL_STATUS.archived,
      archivedAt: new Date('2026-08-24T08:00:00.000Z'),
    });
    const source: GoalAlbumSource = {
      goals: [noProgress, archived, milestones, qualitative, metric],
      directions: [direction],
      spheres: { active: [sphere], archived: [] },
    };

    const model = buildGoalAlbumModel(source);
    const metricCard = cardById(model.cards, 'goal-metric');
    const milestonesCard = cardById(model.cards, 'goal-milestones');
    const qualitativeCard = cardById(model.cards, 'goal-qualitative');
    const noProgressCard = cardById(model.cards, 'goal-no-progress');
    const archivedCard = cardById(model.cards, 'goal-archived');

    expect(model.counts).toEqual({ active: 1, future: 2, achieved: 1, total: 4 });
    expect(selectGoalAlbumCards(model.cards, 'all')).toHaveLength(4);
    expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.archived)).toHaveLength(1);
    expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.active)).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: GOAL_STATUS.active })]),
    );
    expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.active).map((card) => card.id)).toEqual([
      'goal-metric',
    ]);
    expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.future).map((card) => card.id)).toEqual([
      'goal-milestones',
      'goal-no-progress',
    ]);
    expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.achieved).map((card) => card.id)).toEqual([
      'goal-qualitative',
    ]);
    expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.archived).map((card) => card.id)).toEqual([
      'goal-archived',
    ]);
    expect(metricCard.progress).toMatchObject({
      kind: 'metric',
      current: 125,
      target: 100,
      unit: '%',
      percent: 100,
    });
    expect(milestonesCard.progress).toMatchObject({
      kind: 'milestones',
      completed: 3,
      total: 6,
      percent: 50,
    });
    expect(qualitativeCard.progress).toEqual({ kind: 'qualitative', label: 'В движении' });
    expect(noProgressCard.progress).toEqual({ kind: 'none', label: 'Прогресс не задан' });
    expect(noProgressCard.nextProgress).toBe('Следующий шаг не задан');
    expect(metricCard.direction).toMatchObject({
      kind: 'assigned',
      id: 'direction-health',
      name: 'Здоровье',
      sphere: { id: 'sphere-life', name: 'Жизнь' },
    });
    expect(noProgressCard.direction).toEqual({ kind: 'unassigned', label: 'Без направления' });
    expect(archivedCard.direction).toEqual({
      kind: 'missing',
      label: 'Направление недоступно',
    });
    expect(model.cards.map((card) => card.id)).toEqual([
      'goal-metric',
      'goal-milestones',
      'goal-qualitative',
      'goal-no-progress',
      'goal-archived',
    ]);
  });

  it('maps every domain status, stage, horizon, and qualitative progress label', () => {
    const statusCases = [
      { status: GOAL_STATUS.active, stage: GOAL_STAGE.activeGoal, label: 'Активная' },
      { status: GOAL_STATUS.future, stage: GOAL_STAGE.idea, label: 'Будущая' },
      { status: GOAL_STATUS.achieved, stage: GOAL_STAGE.achieved, label: 'Достигнута' },
      { status: GOAL_STATUS.archived, stage: GOAL_STAGE.idea, label: 'Архивная' },
    ] as const;
    const stageCases = [
      { stage: GOAL_STAGE.idea, label: 'Идея' },
      { stage: GOAL_STAGE.intention, label: 'Намерение' },
      { stage: GOAL_STAGE.activeGoal, label: 'Активная цель' },
      { stage: GOAL_STAGE.achieved, label: 'Достигнута' },
    ] as const;
    const horizonCases = [
      { horizon: GOAL_HORIZON.now, label: 'Сейчас' },
      { horizon: GOAL_HORIZON.withinYear, label: 'В течение года' },
      { horizon: GOAL_HORIZON.oneToThreeYears, label: '1–3 года' },
      { horizon: GOAL_HORIZON.threeToFiveYears, label: '3–5 лет' },
      { horizon: GOAL_HORIZON.someday, label: 'Когда-нибудь' },
      { horizon: null, label: 'Горизонт не задан' },
    ] as const;
    const qualitativeCases = [
      { stage: GOAL_QUALITATIVE_STAGE.start, label: 'Начало' },
      { stage: GOAL_QUALITATIVE_STAGE.moving, label: 'В движении' },
      { stage: GOAL_QUALITATIVE_STAGE.close, label: 'Близко' },
      { stage: GOAL_QUALITATIVE_STAGE.done, label: 'Готово' },
    ] as const;
    const goals = [
      ...statusCases.map(({ status, stage, label }) => ({
        goal: rehydrateGoal({
          id: EntityId.create(`goal-status-${status}`),
          title: `Статус ${label}`,
          status,
          stage,
          archivedAt: status === GOAL_STATUS.archived ? new Date('2026-08-24T08:00:00.000Z') : null,
        }),
        expectedLabel: label,
      })),
      ...stageCases.map(({ stage, label }) => ({
        goal: rehydrateGoal({
          id: EntityId.create(`goal-stage-${stage}`),
          title: `Стадия ${label}`,
          status: stage === GOAL_STAGE.achieved ? GOAL_STATUS.achieved : GOAL_STATUS.future,
          stage,
        }),
        expectedLabel: label,
      })),
      ...horizonCases.map(({ horizon, label }) => ({
        goal: rehydrateGoal({
          id: EntityId.create(`goal-horizon-${horizon ?? 'none'}`),
          title: `Горизонт ${label}`,
          horizon,
        }),
        expectedLabel: label,
      })),
      ...qualitativeCases.map(({ stage, label }) => ({
        goal: rehydrateGoal({
          id: EntityId.create(`goal-qualitative-${stage}`),
          title: `Качество ${label}`,
          progress: { type: GOAL_PROGRESS_TYPE.qualitative, stage },
        }),
        expectedLabel: label,
      })),
      {
        goal: rehydrateGoal({
          id: EntityId.create('goal-metric-zero'),
          title: 'Метрика с нуля',
          progress: { type: GOAL_PROGRESS_TYPE.metric, current: 0, target: 100, unit: '%' },
        }),
        expectedLabel: 'metric-zero',
      },
      {
        goal: rehydrateGoal({
          id: EntityId.create('goal-milestones-empty'),
          title: 'Пустые этапы',
          progress: { type: GOAL_PROGRESS_TYPE.milestones, completed: 0, total: 6 },
        }),
        expectedLabel: 'milestones-empty',
      },
      {
        goal: rehydrateGoal({
          id: EntityId.create('goal-milestones-full'),
          title: 'Полные этапы',
          progress: { type: GOAL_PROGRESS_TYPE.milestones, completed: 6, total: 6 },
        }),
        expectedLabel: 'milestones-full',
      },
    ];
    const model = buildGoalAlbumModel({
      goals: goals.map(({ goal }) => goal),
      directions: [],
      spheres: { active: [], archived: [] },
    });

    for (const { status, label } of statusCases) {
      expect(cardById(model.cards, `goal-status-${status}`).statusLabel).toBe(label);
    }
    for (const { stage, label } of stageCases) {
      expect(cardById(model.cards, `goal-stage-${stage}`).stageLabel).toBe(label);
    }
    for (const { horizon, label } of horizonCases) {
      expect(cardById(model.cards, `goal-horizon-${horizon ?? 'none'}`).horizonLabel).toBe(label);
    }
    for (const { stage, label } of qualitativeCases) {
      expect(cardById(model.cards, `goal-qualitative-${stage}`).progress).toEqual({
        kind: 'qualitative',
        label,
      });
    }
    expect(cardById(model.cards, 'goal-metric-zero').progress).toMatchObject({ percent: 0 });
    expect(cardById(model.cards, 'goal-milestones-empty').progress).toMatchObject({ percent: 0 });
    expect(cardById(model.cards, 'goal-milestones-full').progress).toMatchObject({ percent: 100 });
  });

  it('groups visible cards by real Russian-sorted spheres and directions without mutating inputs', () => {
    const sphereЯблоко = Sphere.create({
      id: EntityId.create('sphere-apple'),
      name: 'Яблоко',
      now: CREATED_AT,
    });
    const sphereАльфа = Sphere.create({
      id: EntityId.create('sphere-alpha'),
      name: 'Альфа',
      now: CREATED_AT,
    }).archive(new Date('2026-08-24T08:00:00.000Z'));
    const directionЯкорь = rehydrateDirection({
      id: EntityId.create('direction-anchor'),
      sphereId: sphereЯблоко.id,
      name: 'Якорь',
    });
    const directionАрфа = rehydrateDirection({
      id: EntityId.create('direction-harp'),
      sphereId: sphereЯблоко.id,
      name: 'Арфа',
    });
    const directionБета = rehydrateDirection({
      id: EntityId.create('direction-beta'),
      sphereId: sphereАльфа.id,
      name: 'Бета',
    });
    const directionБезСферы = rehydrateDirection({
      id: EntityId.create('direction-alone'),
      name: 'Без сферы',
    });
    const goals = [
      rehydrateGoal({
        id: EntityId.create('goal-anchor'),
        directionId: directionЯкорь.id,
        title: 'Якорная цель',
      }),
      rehydrateGoal({
        id: EntityId.create('goal-anchor-newest'),
        directionId: directionЯкорь.id,
        title: 'Новейшая цель',
        updatedAt: new Date('2026-08-26T08:00:00.000Z'),
      }),
      rehydrateGoal({
        id: EntityId.create('goal-anchor-alpha'),
        directionId: directionЯкорь.id,
        title: 'Альфа цель',
        updatedAt: new Date('2026-08-25T08:00:00.000Z'),
      }),
      rehydrateGoal({
        id: EntityId.create('goal-anchor-beta'),
        directionId: directionЯкорь.id,
        title: 'Бета цель',
        updatedAt: new Date('2026-08-25T08:00:00.000Z'),
      }),
      rehydrateGoal({
        id: EntityId.create('goal-anchor-same-a'),
        directionId: directionЯкорь.id,
        title: 'Одинаковая цель',
        updatedAt: new Date('2026-08-25T08:00:00.000Z'),
      }),
      rehydrateGoal({
        id: EntityId.create('goal-anchor-same-b'),
        directionId: directionЯкорь.id,
        title: 'Одинаковая цель',
        updatedAt: new Date('2026-08-25T08:00:00.000Z'),
      }),
      rehydrateGoal({
        id: EntityId.create('goal-harp'),
        directionId: directionАрфа.id,
        title: 'Арфовая цель',
      }),
      rehydrateGoal({
        id: EntityId.create('goal-beta'),
        directionId: directionБета.id,
        title: 'Бета цель',
      }),
      rehydrateGoal({
        id: EntityId.create('goal-alone'),
        directionId: directionБезСферы.id,
        title: 'Одинокая цель',
      }),
      rehydrateGoal({ id: EntityId.create('goal-none'), title: 'Без направления' }),
      rehydrateGoal({
        id: EntityId.create('goal-missing'),
        directionId: EntityId.create('direction-gone'),
        title: 'Потерянное направление',
      }),
    ];
    const directions = [directionЯкорь, directionБезСферы, directionБета, directionАрфа];
    const active = [sphereЯблоко];
    const archived = [sphereАльфа];
    const source: GoalAlbumSource = { goals, directions, spheres: { active, archived } };
    const originalGoalIds = goals.map((goal) => goal.id.toString());
    const originalDirectionIds = directions.map((direction) => direction.id.toString());
    const originalActiveIds = active.map((sphere) => sphere.id.toString());
    const originalArchivedIds = archived.map((sphere) => sphere.id.toString());

    const model = buildGoalAlbumModel(source);
    const groups = groupGoalAlbumCards(selectGoalAlbumCards(model.cards, 'all'));

    expect(groups.spheres.map((group) => group.name)).toEqual(['Альфа', 'Яблоко']);
    expect(groups.spheres[0]?.directions.map((direction) => direction.name)).toEqual(['Бета']);
    expect(groups.spheres[1]?.directions.map((direction) => direction.name)).toEqual([
      'Арфа',
      'Якорь',
    ]);
    expect(groups.spheres[1]?.directions[1]?.goals.map((card) => card.id)).toEqual([
      'goal-anchor-newest',
      'goal-anchor-alpha',
      'goal-anchor-beta',
      'goal-anchor-same-a',
      'goal-anchor-same-b',
      'goal-anchor',
    ]);
    expect(groups.withoutSphere).toMatchObject([{ id: 'direction-alone', name: 'Без сферы' }]);
    expect(groups.withoutDirection.map((card) => card.id)).toEqual(['goal-none']);
    expect(groups.missingDirection.map((card) => card.id)).toEqual(['goal-missing']);
    expect(goals.map((goal) => goal.id.toString())).toEqual(originalGoalIds);
    expect(directions.map((direction) => direction.id.toString())).toEqual(originalDirectionIds);
    expect(active.map((sphere) => sphere.id.toString())).toEqual(originalActiveIds);
    expect(archived.map((sphere) => sphere.id.toString())).toEqual(originalArchivedIds);
  });
});

function cardById<Cards extends readonly { readonly id: string }[]>(
  cards: Cards,
  id: string,
): Cards[number] {
  const card = cards.find((item) => item.id === id);
  if (card === undefined) throw new Error(`Expected goal card ${id}.`);
  return card;
}
