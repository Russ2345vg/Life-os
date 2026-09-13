import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  Direction,
  EntityId,
  Goal,
  GOAL_PROGRESS_TYPE,
  GOAL_STAGE,
  GOAL_STATUS,
  Sphere,
} from '../../domain';
import { success } from '../../shared/result/Result';
import { validateGoalForm, type GoalFormDraft } from './GoalFormModel';
import { GoalCreateScreen } from './GoalCreatePage';
import { createGoalSubmissionExecutor, loadGoalFormOptions } from './GoalCreatePageSupport';

const NOW = new Date('2026-08-24T08:00:00.000Z');

describe('GoalCreatePage', () => {
  it('loads Direction and Sphere options through application queries', async () => {
    const direction = Direction.create({
      id: EntityId.create('direction-home'),
      name: 'Среда жизни',
      now: NOW,
    });
    const sphere = Sphere.create({ id: EntityId.create('sphere-home'), name: 'Дом', now: NOW });
    const getDirections = { execute: vi.fn().mockResolvedValue([direction]) };
    const getSpheres = {
      execute: vi.fn().mockResolvedValue({ active: [sphere], archived: [] }),
    };

    await expect(loadGoalFormOptions({ getDirections, getSpheres })).resolves.toEqual({
      directions: [direction],
      spheres: { active: [sphere], archived: [] },
    });
    expect(getDirections.execute).toHaveBeenCalledOnce();
    expect(getSpheres.execute).toHaveBeenCalledOnce();
  });

  it('sends command-ready values without description and redirects after mutation', async () => {
    const draft: GoalFormDraft = {
      title: 'Собственный дом',
      whyImportant: '  Для семьи  ',
      whyNow: '',
      directionId: 'direction-home',
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: null,
      horizon: null,
      progress: { kind: 'metric', current: '25', target: '100', unit: '%' },
      achievementCriteria: 'Дом готов',
      nextProgress: 'Согласовать цель',
      coverImage: null,
    };
    const validation = validateGoalForm(draft, 'create');
    if (!validation.ok) throw new Error('Expected a valid fixture.');
    const goal = Goal.create({ id: EntityId.create('goal-created'), title: draft.title, now: NOW });
    const createGoal = { execute: vi.fn().mockResolvedValue(success(goal)) };
    const calls: string[] = [];
    const onMutated = vi.fn(() => calls.push('mutated'));
    const onRouteChange = vi.fn(() => calls.push('routed'));

    const execute = createGoalSubmissionExecutor({ createGoal, onMutated, onRouteChange });
    await expect(execute(validation.values)).resolves.toEqual(success(goal));

    expect(createGoal.execute).toHaveBeenCalledWith({
      title: 'Собственный дом',
      directionId: EntityId.create('direction-home'),
      whyImportant: 'Для семьи',
      whyNow: null,
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: null,
      horizon: null,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 25, target: 100, unit: '%' },
      achievementCriteria: 'Дом готов',
      nextProgress: 'Согласовать цель',
      coverImage: null,
    });
    expect(createGoal.execute.mock.calls[0]?.[0]).not.toHaveProperty('description');
    expect(onRouteChange).toHaveBeenCalledWith({ view: 'detail', goalId: 'goal-created' });
    expect(calls).toEqual(['mutated', 'routed']);
  });

  it('renders explicit loading/error states and the shared form when ready', () => {
    const common = {
      draft: {
        title: '',
        whyImportant: '',
        whyNow: '',
        directionId: null,
        stage: GOAL_STAGE.idea,
        intentionLevel: null,
        horizon: null,
        progress: { kind: 'none' as const },
        achievementCriteria: '',
        nextProgress: '',
        coverImage: null,
      },
      submissionState: { status: 'idle' as const },
      coverState: 'idle' as const,
      coverError: null,
      onDraftChange: vi.fn(),
      onCoverFile: vi.fn(),
      onRemoveCover: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      onRetryOptions: vi.fn(),
    };

    const loading = renderToStaticMarkup(
      createElement(GoalCreateScreen, { ...common, optionsState: { status: 'loading' } }),
    );
    const error = renderToStaticMarkup(
      createElement(GoalCreateScreen, { ...common, optionsState: { status: 'error' } }),
    );
    const ready = renderToStaticMarkup(
      createElement(GoalCreateScreen, {
        ...common,
        optionsState: { status: 'ready', directionGroups: [] },
      }),
    );

    expect(loading).toContain('Загружаем параметры цели…');
    expect(error).toContain('Не удалось загрузить направления');
    expect(error).toContain('Повторить');
    expect(ready).toContain('Новая цель');
    expect(ready).toContain('Альбом целей · Создание');
    expect(ready).not.toContain('Goal Album · A3');
    expect(ready).toContain('<form');
  });
});
