import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EntityId, Goal, GOAL_PROGRESS_TYPE, GOAL_STAGE, GOAL_STATUS } from '../../domain';
import { GoalDetailScreen } from './GoalDetailPage';
import type { GoalArchiveState } from './GoalArchiveController';
import type { GoalDeleteState } from './GoalDeleteController';
import type { GoalDetailModel } from './goalDetailPresentation';

const NOW = new Date('2026-08-24T09:00:00.000Z');

function model(): GoalDetailModel {
  const goal = Goal.create({
    id: EntityId.create('goal-home'),
    title: 'Собственный дом',
    status: GOAL_STATUS.active,
    stage: GOAL_STAGE.activeGoal,
    progress: { type: GOAL_PROGRESS_TYPE.metric, current: 68, target: 100, unit: '%' },
    now: NOW,
  });
  return {
    goal,
    id: 'goal-home',
    title: 'Собственный дом',
    description: 'Пространство для семьи.',
    coverImageUrl: null,
    directionLabel: 'Среда жизни',
    sphereLabel: 'Дом',
    statusLabel: 'Активная',
    stageLabel: 'Активная цель',
    intentionLabel: 'Обязуюсь',
    horizonLabel: '1–3 года',
    progressTypeLabel: 'Измеримый',
    progress: {
      kind: 'metric',
      label: '68 из 100 %',
      percent: 68,
      current: 68,
      target: 100,
      unit: '%',
    },
    whyImportant: 'Свобода выбора.',
    whyNow: 'Есть ресурсы.',
    achievementCriteria: 'Дом введён в эксплуатацию.',
    nextProgress: 'Подготовить финансовую модель.',
    createdAtLabel: '24.08.2026',
    updatedAtLabel: '24.08.2026',
  };
}

function render(
  state: Parameters<typeof GoalDetailScreen>[0]['state'],
  archiveState: GoalArchiveState = { status: 'idle' },
  deleteState: GoalDeleteState = { status: 'idle' },
): string {
  return renderToStaticMarkup(
    createElement(GoalDetailScreen, {
      state,
      onRetry: vi.fn(),
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onArchiveRequest: vi.fn(),
      onDeleteRequest: vi.fn(),
      archiveState,
      deleteState,
    }),
  );
}

describe('Goal detail A2 screen', () => {
  it('renders loading, retryable error, and not-found as separate states', () => {
    expect(render({ status: 'loading' })).toContain('Загружаем цель…');
    expect(render({ status: 'error' })).toContain('Не удалось загрузить цель');
    expect(render({ status: 'error' })).toContain('>Повторить</button>');
    expect(render({ status: 'not-found' })).toContain('Цель не найдена');
  });

  it('renders the A2 semantic sections, metadata, progress, edit and archive actions', () => {
    const markup = render({ status: 'ready', model: model() });

    for (const value of [
      'Собственный дом',
      'Почему это важно',
      'Свобода выбора.',
      'Почему сейчас',
      'Критерий достижения',
      'Следующее продвижение',
      'Подготовить финансовую модель.',
      'Информация цели',
      'Среда жизни',
      'Дом',
      '68 из 100 %',
      'Редактировать',
      'Архивировать',
      'Удалить',
    ])
      expect(markup).toContain(value);
    expect(markup).toContain('href="#/goals/goal-home/edit"');
    expect(markup).toContain('<progress');
    expect(markup).toContain('class="goal-detail-hero goal-detail-hero--without-cover"');
    expect(markup).toContain('<dt>Направление</dt>');
    expect(markup).toContain('<dt>Сфера</dt>');
    expect(markup).not.toContain('<dt>Direction</dt>');
    expect(markup).not.toContain('<dt>Sphere</dt>');

    const heroStart = markup.indexOf('class="goal-detail-hero');
    const heroEnd = markup.indexOf('class="goal-detail-layout"');
    const heroMarkup = markup.slice(heroStart, heroEnd);
    expect(heroMarkup).toContain('1–3 года');
    expect(heroMarkup).not.toContain('24.08.2026');
    expect(markup).toContain('Обязуюсь');
    expect(markup).toContain('24.08.2026');
  });

  it('renders a distinct pending and retryable synced-delete state', () => {
    const ready = { status: 'ready' as const, model: model() };
    const pending = render(ready, { status: 'idle' }, { status: 'deleting' });
    const error = render(
      ready,
      { status: 'idle' },
      {
        status: 'error',
        message: 'Не удалось удалить цель. Попробуйте ещё раз.',
      },
    );

    expect(pending).toContain('Удаляем…');
    expect(pending).toMatch(/<button[^>]*disabled=""[^>]*>Удаляем…<\/button>/u);
    expect(error).toContain('role="alert"');
    expect(error).toContain('Не удалось удалить цель. Попробуйте ещё раз.');
  });

  it('keeps the full media hero only when a cover exists', () => {
    const markup = render({
      status: 'ready',
      model: { ...model(), coverImageUrl: 'data:image/png;base64,AA==' },
    });

    expect(markup).toContain('class="goal-detail-hero"');
    expect(markup).not.toContain('goal-detail-hero--without-cover');
    expect(markup).toContain('<img src="data:image/png;base64,AA=="');
  });

  it('renders pending, error and successful archive states without duplicate actions', () => {
    const ready = { status: 'ready' as const, model: model() };
    const pending = render(ready, { status: 'archiving' });
    const error = render(ready, { status: 'error', message: 'Повторите архивацию.' });
    const archivedGoal = ready.model.goal.archive(new Date(NOW.getTime() + 1_000));
    const success = render(
      { status: 'ready', model: { ...ready.model, goal: archivedGoal, statusLabel: 'Архивная' } },
      { status: 'success', goal: archivedGoal },
    );

    expect(pending).toContain('Архивируем…');
    expect(pending).toMatch(/<button[^>]*disabled=""[^>]*>Архивируем…<\/button>/u);
    expect(error).toContain('role="alert"');
    expect(error).toContain('Повторите архивацию.');
    expect(success).toContain('Цель перемещена в архив');
    expect(success).toContain('Вернуться в Альбом');
    expect(success).not.toContain('Редактировать');
    expect(success).not.toContain('>Архивировать</button>');
  });

  it('keeps long real-world content and metadata in semantic source order', () => {
    const longTitle = 'Очень длинная формулировка цели '.repeat(5);
    const longWhy = 'Подробное объяснение важности без визуального сокращения. '.repeat(8);
    const longCriteria = 'Наблюдаемый критерий достижения подтверждён фактами. '.repeat(7);
    const longNext = 'Следующее продвижение содержит несколько уточняющих условий. '.repeat(7);
    const detail = {
      ...model(),
      title: longTitle,
      whyImportant: longWhy,
      achievementCriteria: longCriteria,
      nextProgress: longNext,
      directionLabel: 'Направление с подробным названием для проверки переноса',
    };
    const markup = render({ status: 'ready', model: detail });

    for (const value of [longTitle, longWhy, longCriteria, longNext, detail.directionLabel]) {
      expect(markup).toContain(value);
    }
    expect(markup.indexOf(longWhy)).toBeLessThan(markup.indexOf(longCriteria));
    expect(markup.indexOf(longNext)).toBeLessThan(markup.indexOf(longWhy));
  });
});
