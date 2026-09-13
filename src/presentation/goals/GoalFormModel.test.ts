import { describe, expect, it } from 'vitest';
import {
  DIRECTION_STATUS,
  Direction,
  EntityId,
  Goal,
  GOAL_HORIZON,
  GOAL_INTENTION_LEVEL,
  GOAL_PROGRESS_TYPE,
  GOAL_QUALITATIVE_STAGE,
  GOAL_STAGE,
  GOAL_STATUS,
  MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH,
  MAX_GOAL_NEXT_PROGRESS_LENGTH,
  MAX_GOAL_TITLE_LENGTH,
  MAX_GOAL_WHY_LENGTH,
  Sphere,
} from '../../domain';
import {
  buildGoalDirectionOptionGroups,
  buildGoalFormPreview,
  createEmptyGoalFormDraft,
  createGoalFormDraft,
  statusForStage,
  validateGoalForm,
  type GoalFormDraft,
} from './GoalFormModel';

const NOW = new Date('2026-08-24T08:00:00.000Z');

function createSphere(id: string, name: string): Sphere {
  return Sphere.create({ id: EntityId.create(id), name, now: NOW });
}

function createDirection(input: {
  readonly id: string;
  readonly name: string;
  readonly sphereId?: string | null;
  readonly archived?: boolean;
}): Direction {
  const direction = Direction.create({
    id: EntityId.create(input.id),
    name: input.name,
    sphereId: input.sphereId == null ? null : EntityId.create(input.sphereId),
    now: NOW,
  });
  return input.archived === true ? direction.archive(new Date(NOW.getTime() + 1_000)) : direction;
}

function draft(overrides: Partial<GoalFormDraft> = {}): GoalFormDraft {
  return { ...createEmptyGoalFormDraft(), title: 'Собственный дом', ...overrides };
}

describe('GoalFormModel', () => {
  it('creates the approved initial draft and maps stages to statuses', () => {
    expect(createEmptyGoalFormDraft()).toMatchObject({
      title: '',
      stage: GOAL_STAGE.idea,
      directionId: null,
      progress: { kind: 'metric', current: '0', target: '100', unit: '%' },
    });
    expect([
      statusForStage(GOAL_STAGE.idea),
      statusForStage(GOAL_STAGE.intention),
      statusForStage(GOAL_STAGE.activeGoal),
      statusForStage(GOAL_STAGE.achieved),
    ]).toEqual([GOAL_STATUS.future, GOAL_STATUS.future, GOAL_STATUS.active, GOAL_STATUS.achieved]);
  });

  it('requires an active goal to have a Direction but allows an idea without one', () => {
    expect(
      validateGoalForm(draft({ stage: GOAL_STAGE.activeGoal, directionId: null }), 'create'),
    ).toMatchObject({
      ok: false,
      errors: { directionId: 'Активной цели необходимо направление.' },
      firstInvalidField: 'directionId',
    });
    expect(
      validateGoalForm(draft({ stage: GOAL_STAGE.idea, directionId: null }), 'create'),
    ).toMatchObject({
      ok: true,
      values: { status: GOAL_STATUS.future, stage: GOAL_STAGE.idea, directionId: null },
    });
    expect(() =>
      validateGoalForm(draft({ stage: GOAL_STAGE.activeGoal, directionId: '   ' }), 'create'),
    ).not.toThrow();
    expect(
      validateGoalForm(draft({ stage: GOAL_STAGE.activeGoal, directionId: '   ' }), 'create'),
    ).toMatchObject({ ok: false, firstInvalidField: 'directionId' });
  });

  it('normalizes optional text and builds all progress variants without throwing', () => {
    expect(
      validateGoalForm(
        draft({
          whyImportant: '  Для семьи  ',
          whyNow: '   ',
          achievementCriteria: '  Дом готов  ',
          nextProgress: '  Сверить бюджет  ',
          progress: { kind: 'metric', current: '25', target: '100', unit: ' % ' },
        }),
        'create',
      ),
    ).toMatchObject({
      ok: true,
      values: {
        whyImportant: 'Для семьи',
        whyNow: null,
        achievementCriteria: 'Дом готов',
        nextProgress: 'Сверить бюджет',
        progress: { type: GOAL_PROGRESS_TYPE.metric, current: 25, target: 100, unit: '%' },
      },
    });

    expect(
      validateGoalForm(
        draft({ progress: { kind: 'milestones', completed: '2', total: '5' } }),
        'create',
      ),
    ).toMatchObject({
      ok: true,
      values: { progress: { type: GOAL_PROGRESS_TYPE.milestones, completed: 2, total: 5 } },
    });
    expect(
      validateGoalForm(
        draft({ progress: { kind: 'qualitative', stage: GOAL_QUALITATIVE_STAGE.close } }),
        'create',
      ),
    ).toMatchObject({
      ok: true,
      values: {
        progress: { type: GOAL_PROGRESS_TYPE.qualitative, stage: GOAL_QUALITATIVE_STAGE.close },
      },
    });
    expect(validateGoalForm(draft({ progress: { kind: 'none' } }), 'create')).toMatchObject({
      ok: true,
      values: { progress: null },
    });
  });

  it('returns focused validation feedback for progress, stage and domain length limits', () => {
    expect(
      validateGoalForm(
        draft({ progress: { kind: 'milestones', completed: '3.5', total: '2' } }),
        'create',
      ),
    ).toMatchObject({ ok: false, firstInvalidField: 'progressCompleted' });
    expect(
      validateGoalForm(
        draft({ progress: { kind: 'milestones', completed: '3', total: '2' } }),
        'create',
      ),
    ).toMatchObject({ ok: false, firstInvalidField: 'progressCompleted' });
    expect(validateGoalForm(draft({ stage: GOAL_STAGE.achieved }), 'create')).toMatchObject({
      ok: false,
      errors: { stage: 'Стадия «Достигнута» доступна только при редактировании.' },
    });

    const cases = [
      ['title', { title: 'x'.repeat(MAX_GOAL_TITLE_LENGTH + 1) }],
      ['whyImportant', { whyImportant: 'x'.repeat(MAX_GOAL_WHY_LENGTH + 1) }],
      [
        'achievementCriteria',
        { achievementCriteria: 'x'.repeat(MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH + 1) },
      ],
      ['nextProgress', { nextProgress: 'x'.repeat(MAX_GOAL_NEXT_PROGRESS_LENGTH + 1) }],
    ] as const;
    for (const [field, overrides] of cases) {
      expect(validateGoalForm(draft(overrides), 'edit')).toMatchObject({
        ok: false,
        firstInvalidField: field,
      });
    }
  });

  it('groups active Directions by Sphere and retains only the current archived Direction', () => {
    const home = createSphere('sphere-home', 'Дом');
    const active = createDirection({
      id: 'direction-home',
      name: 'Среда жизни',
      sphereId: 'sphere-home',
    });
    const withoutSphere = createDirection({ id: 'direction-health', name: 'Здоровье' });
    const currentArchived = createDirection({
      id: 'direction-old',
      name: 'Старое направление',
      sphereId: 'sphere-home',
      archived: true,
    });
    const otherArchived = createDirection({
      id: 'direction-hidden',
      name: 'Скрытое направление',
      archived: true,
    });

    expect(currentArchived.status).toBe(DIRECTION_STATUS.archived);
    expect(
      buildGoalDirectionOptionGroups(
        [otherArchived, withoutSphere, currentArchived, active],
        { active: [home], archived: [] },
        'direction-old',
      ),
    ).toEqual([
      {
        sphereId: 'sphere-home',
        sphereName: 'Дом',
        options: [
          { id: 'direction-home', name: 'Среда жизни', archived: false },
          { id: 'direction-old', name: 'Старое направление', archived: true },
        ],
      },
      {
        sphereId: null,
        sphereName: 'Без сферы',
        options: [{ id: 'direction-health', name: 'Здоровье', archived: false }],
      },
    ]);
  });

  it('prefills every editable field from Goal and builds a presentation-only preview', () => {
    const goal = Goal.rehydrate({
      id: EntityId.create('goal-home'),
      directionId: EntityId.create('direction-home'),
      title: 'Собственный дом',
      description: 'Сохраняется командой редактирования, но не выводится в форме',
      whyImportant: 'Опора для семьи',
      whyNow: 'Подходящий момент',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
      horizon: GOAL_HORIZON.oneToThreeYears,
      progress: { type: GOAL_PROGRESS_TYPE.milestones, completed: 2, total: 6 },
      achievementCriteria: 'Дом принят',
      nextProgress: 'Согласовать цель',
      coverImage: { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', sizeBytes: 1 },
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      version: 3,
    });
    const prefilled = createGoalFormDraft(goal);

    expect(prefilled).toEqual({
      description: goal.description,
      sphereId: null,
      preservesUnassignedActive: false,
      title: 'Собственный дом',
      whyImportant: 'Опора для семьи',
      whyNow: 'Подходящий момент',
      directionId: 'direction-home',
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
      horizon: GOAL_HORIZON.oneToThreeYears,
      progress: { kind: 'milestones', completed: '2', total: '6' },
      achievementCriteria: 'Дом принят',
      nextProgress: 'Согласовать цель',
      coverImage: goal.coverImage,
    });

    const groups = buildGoalDirectionOptionGroups(
      [createDirection({ id: 'direction-home', name: 'Среда жизни', sphereId: 'sphere-home' })],
      { active: [createSphere('sphere-home', 'Дом')], archived: [] },
    );
    const preview = buildGoalFormPreview(prefilled, groups);
    expect(preview).toMatchObject({
      id: 'goal-form-preview',
      title: 'Собственный дом',
      coverImageUrl: 'data:image/png;base64,YQ==',
      direction: {
        kind: 'assigned',
        id: 'direction-home',
        name: 'Среда жизни',
        sphere: { id: 'sphere-home', name: 'Дом' },
      },
      status: GOAL_STATUS.active,
      progress: { kind: 'milestones' },
    });
    expect(preview.progress.kind === 'milestones' ? preview.progress.percent : null).toBeCloseTo(
      100 / 3,
    );
  });
});
