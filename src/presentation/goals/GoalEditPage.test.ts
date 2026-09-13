import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EntityId, Goal, GOAL_PROGRESS_TYPE, GOAL_STAGE, GOAL_STATUS } from '../../domain';
import { failure, success } from '../../shared/result/Result';
import { DomainError } from '../../shared/errors/DomainError';
import { validateGoalForm, type GoalFormDraft } from './GoalFormModel';
import { GoalEditScreen } from './GoalEditPage';
import { createGoalUpdateExecutor } from './GoalEditPageSupport';

const NOW = new Date('2026-08-24T08:00:00.000Z');

function goal(): Goal {
  return Goal.create({
    id: EntityId.create('goal-home'),
    directionId: EntityId.create('direction-first'),
    title: 'Собственный дом',
    description: 'Существующее описание должно сохраниться',
    status: GOAL_STATUS.active,
    stage: GOAL_STAGE.activeGoal,
    now: NOW,
  });
}

describe('GoalEditPage', () => {
  it('updates Direction and details with optimistic version, preserving description by omission', async () => {
    const stored = goal();
    const draft: GoalFormDraft = {
      title: 'Обновлённая цель',
      whyImportant: 'Для семьи',
      whyNow: '',
      directionId: 'direction-second',
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: null,
      horizon: null,
      progress: { kind: 'metric', current: '40', target: '100', unit: '%' },
      achievementCriteria: 'Дом готов',
      nextProgress: 'Утвердить смету',
      coverImage: null,
    };
    const validation = validateGoalForm(draft, 'edit');
    if (!validation.ok) throw new Error('Expected valid edit fixture.');
    const updated = stored.update(
      { title: draft.title, directionId: EntityId.create('direction-second') },
      new Date(NOW.getTime() + 1_000),
    );
    const updateGoal = { execute: vi.fn().mockResolvedValue(success(updated)) };
    const calls: string[] = [];
    const onMutated = vi.fn(() => calls.push('mutated'));
    const onRouteChange = vi.fn(() => calls.push('routed'));

    const execute = createGoalUpdateExecutor({
      goal: stored,
      updateGoal,
      onMutated,
      onRouteChange,
    });
    await expect(execute(validation.values)).resolves.toEqual(success(updated));

    expect(updateGoal.execute).toHaveBeenCalledWith({
      id: stored.id,
      expectedVersion: stored.version,
      title: 'Обновлённая цель',
      directionId: EntityId.create('direction-second'),
      whyImportant: 'Для семьи',
      whyNow: null,
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: null,
      horizon: null,
      progress: { type: GOAL_PROGRESS_TYPE.metric, current: 40, target: 100, unit: '%' },
      achievementCriteria: 'Дом готов',
      nextProgress: 'Утвердить смету',
      coverImage: null,
    });
    expect(updateGoal.execute.mock.calls[0]?.[0]).not.toHaveProperty('description');
    expect(onRouteChange).toHaveBeenCalledWith({ view: 'detail', goalId: 'goal-home' });
    expect(calls).toEqual(['mutated', 'routed']);
  });

  it('does not navigate on a version conflict', async () => {
    const stored = goal();
    const updateGoal = {
      execute: vi
        .fn()
        .mockResolvedValue(
          failure(new DomainError('goal.version_conflict', 'Internal conflict details')),
        ),
    };
    const onMutated = vi.fn();
    const onRouteChange = vi.fn();
    const validation = validateGoalForm(
      {
        title: stored.title,
        whyImportant: '',
        whyNow: '',
        directionId: stored.directionId?.toString() ?? null,
        stage: stored.stage,
        intentionLevel: null,
        horizon: null,
        progress: { kind: 'none' },
        achievementCriteria: '',
        nextProgress: '',
        coverImage: null,
      },
      'edit',
    );
    if (!validation.ok) throw new Error('Expected valid edit fixture.');

    await expect(
      createGoalUpdateExecutor({ goal: stored, updateGoal, onMutated, onRouteChange })(
        validation.values,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(onMutated).not.toHaveBeenCalled();
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('renders loading, missing, archived and retryable error states explicitly', () => {
    const common = {
      draft: null,
      submissionState: { status: 'idle' as const },
      coverState: 'idle' as const,
      coverError: null,
      onDraftChange: vi.fn(),
      onCoverFile: vi.fn(),
      onRemoveCover: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      onBackToAlbum: vi.fn(),
      onBackToDetail: vi.fn(),
      onRetry: vi.fn(),
    };
    const states = [
      [{ status: 'loading' as const }, 'Загружаем цель…'],
      [{ status: 'not-found' as const }, 'Цель не найдена'],
      [
        { status: 'archived' as const, goal: goal().archive(NOW) },
        'Архивную цель нельзя редактировать',
      ],
      [{ status: 'error' as const }, 'Не удалось загрузить цель'],
    ] as const;

    for (const [loadState, text] of states) {
      const markup = renderToStaticMarkup(createElement(GoalEditScreen, { ...common, loadState }));
      expect(markup).toContain(text);
    }
    const errorMarkup = renderToStaticMarkup(
      createElement(GoalEditScreen, { ...common, loadState: { status: 'error' } }),
    );
    expect(errorMarkup).toContain('Повторить');
  });

  it('uses a Russian eyebrow above the edit form', () => {
    const markup = renderToStaticMarkup(
      createElement(GoalEditScreen, {
        draft: null,
        loadState: { status: 'loading' },
        submissionState: { status: 'idle' },
        coverState: 'idle',
        coverError: null,
        onDraftChange: vi.fn(),
        onCoverFile: vi.fn(),
        onRemoveCover: vi.fn(),
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
        onBackToAlbum: vi.fn(),
        onBackToDetail: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain('Альбом целей · Редактирование');
    expect(markup).not.toContain('Goal Album · A3');
  });
});
