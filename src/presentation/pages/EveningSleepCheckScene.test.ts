import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EveningSleepCheckModel } from './EveningSleepCheckPresentation';
import { EveningSleepCheckSceneState, EveningSleepCheckSceneView } from './EveningSleepCheckScene';

describe('EveningSleepCheckScene', () => {
  it('сохраняет одну геометрию для loading и retryable error', () => {
    const loading = renderToStaticMarkup(
      createElement(EveningSleepCheckSceneState, { status: 'loading' }),
    );
    const error = renderToStaticMarkup(
      createElement(EveningSleepCheckSceneState, {
        status: 'error',
        message: 'Не удалось загрузить.',
        onRetry: vi.fn(),
      }),
    );
    expect(loading).toContain('data-sleep-check-state="loading"');
    expect(loading).toContain('Проверка перед сном');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Повторить');
  });

  it('показывает ровно один active question и две крупные answer controls', () => {
    const markup = render(questionModel());
    expect(markup).toContain('2 / 3');
    expect(markup).toContain('Есть что-то, что ещё держишь в голове?');
    expect(markup).toContain('>Да<');
    expect(markup).toContain('>Нет<');
    expect(markup.match(/data-sleep-answer=/g)).toHaveLength(2);
    expect(markup.match(/data-sleep-focus=/g)).toHaveLength(1);
  });

  it('показывает saving feedback и отдельное обновление stale данных', () => {
    const saving = render(questionModel(), { busy: true });
    const stale = render(questionModel(), {
      error: 'Данные вечера изменились.',
      stale: true,
    });

    expect(saving).toContain('role="status"');
    expect(saving).toContain('Сохраняем…');
    expect(stale).toContain('Обновить данные');
  });

  it('рендерит capture label/maxLength и final summary CTA', () => {
    const corrective = render({
      ...questionModel(),
      phase: 'corrective-action',
      question: null,
      correctiveAction: {
        questionId: 'HOLDING_THOUGHT',
        action: 'CAPTURE_THOUGHT',
        label: 'Оставить одну мысль на завтра',
        captureRequired: true,
        selected: true,
      },
    });
    const summary = render({
      ...questionModel(),
      phase: 'summary',
      question: null,
      calm: { before: 2, after: 4 },
      sleepReadiness: { before: 3, after: 5 },
    });
    expect(corrective).toContain('Что оставить на завтра?');
    expect(corrective).toContain('maxLength="280"');
    expect(summary).toContain('Вечер можно отпустить');
    expect(summary).toContain('Завершить вечер');
  });
});

function render(
  model: EveningSleepCheckModel,
  overrides: Partial<Parameters<typeof EveningSleepCheckSceneView>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(EveningSleepCheckSceneView, {
      model,
      calmDraft: null,
      readinessDraft: null,
      thoughtDraft: '',
      busy: false,
      error: null,
      stale: false,
      onCalmChange: vi.fn(),
      onReadinessChange: vi.fn(),
      onThoughtChange: vi.fn(),
      onSaveRatings: vi.fn(),
      onAnswer: vi.fn(),
      onCorrectiveAction: vi.fn(),
      onComplete: vi.fn(),
      onRetryOperation: vi.fn(),
      onReload: vi.fn(),
      ...overrides,
    }),
  );
}

function questionModel(): EveningSleepCheckModel {
  return {
    phase: 'question',
    readOnly: false,
    progress: '2 / 3',
    question: { id: 'HOLDING_THOUGHT', prompt: 'Есть что-то, что ещё держишь в голове?' },
    correctiveAction: null,
    calm: { before: 2, after: 4 },
    sleepReadiness: { before: 3, after: 4 },
    legacyMessage: null,
    completedActionLabel: null,
  };
}
