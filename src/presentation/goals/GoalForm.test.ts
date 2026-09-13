import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  GOAL_INTENTION_LEVEL,
  GOAL_QUALITATIVE_STAGE,
  GOAL_STAGE,
  MAX_GOAL_TITLE_LENGTH,
} from '../../domain';
import { GoalForm } from './GoalForm';
import { createEmptyGoalFormDraft, type GoalFormDraft } from './GoalFormModel';

const DIRECTIONS = [
  {
    sphereId: 'sphere-home',
    sphereName: 'Дом',
    options: [
      { id: 'direction-home', name: 'Среда жизни', archived: false },
      { id: 'direction-old', name: 'Старое направление', archived: true },
    ],
  },
] as const;

function renderForm(
  draft: GoalFormDraft = createEmptyGoalFormDraft(),
  overrides: Partial<Parameters<typeof GoalForm>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(GoalForm, {
      mode: 'create',
      draft,
      directions: DIRECTIONS,
      errors: {},
      disabled: false,
      coverState: 'idle',
      submitError: null,
      focusField: null,
      onChange: vi.fn(),
      onCoverFile: vi.fn(),
      onRemoveCover: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      ...overrides,
    }),
  );
}

describe('GoalForm', () => {
  it('renders the shared sections, grouped Direction selector, metric inputs and live preview', () => {
    const markup = renderForm({
      ...createEmptyGoalFormDraft(),
      title: 'Собственный дом',
      directionId: 'direction-old',
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: GOAL_INTENTION_LEVEL.commit,
    });

    expect(markup).toContain('Основное');
    expect(markup).toContain('Параметры');
    expect(markup).toContain(`maxLength="${MAX_GOAL_TITLE_LENGTH}"`);
    expect(markup).toContain(`${'Собственный дом'.length} / ${MAX_GOAL_TITLE_LENGTH}`);
    expect(markup).toContain('<optgroup label="Дом">');
    expect(markup).toContain('Старое направление · В архиве');
    expect(markup).toContain('id="goal-progress-current"');
    expect(markup).toContain('id="goal-progress-target"');
    expect(markup).toContain('id="goal-progress-unit"');
    expect(markup).toContain('aria-label="Предпросмотр цели"');
    expect(markup).toContain('goal-form-preview-card--without-cover');
    expect(markup).not.toContain('href=');
  });

  it('keeps the preview cover state synchronized with the current draft', () => {
    const markup = renderForm({
      ...createEmptyGoalFormDraft(),
      coverImage: {
        dataUrl: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        sizeBytes: 2,
      },
    });

    expect(markup).toContain('src="data:image/png;base64,AA=="');
    expect(markup).not.toContain('goal-form-preview-card--without-cover');
  });

  it('shows only the selected qualitative progress fields and keeps achieved unavailable in create', () => {
    const markup = renderForm({
      ...createEmptyGoalFormDraft(),
      progress: { kind: 'qualitative', stage: GOAL_QUALITATIVE_STAGE.moving },
    });

    expect(markup).toContain('id="goal-progress-qualitative"');
    expect(markup).not.toContain('id="goal-progress-current"');
    expect(markup).toMatch(/value="achieved"[^>]*disabled=""/u);
  });

  it('associates field errors and exposes a form-level retryable error', () => {
    const markup = renderForm(createEmptyGoalFormDraft(), {
      errors: { title: 'Название цели обязательно.' },
      submitError: 'Не удалось сохранить цель. Попробуйте ещё раз.',
      disabled: true,
      coverState: 'reading',
    });

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="goal-title-hint goal-title-error"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось сохранить цель. Попробуйте ещё раз.');
    expect(markup).toContain('Читаем изображение…');
    expect(markup).toContain('Сохраняем…');
  });

  it('keeps long draft copy visible in the form and preview without interactive preview links', () => {
    const longTitle = 'Длинная формулировка цели '.repeat(6);
    const longNext = 'Ближайшее продвижение с важным контекстом и несколькими условиями. '.repeat(
      6,
    );
    const markup = renderForm({
      ...createEmptyGoalFormDraft(),
      title: longTitle,
      nextProgress: longNext,
    });

    expect(markup).toContain(longTitle);
    expect(markup).toContain(longNext);
    expect(markup).toContain('aria-label="Предпросмотр цели"');
    expect(markup).not.toContain('href=');
  });
});
