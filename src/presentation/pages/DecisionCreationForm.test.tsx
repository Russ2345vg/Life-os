import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, DECISION_KIND, DECISION_PRIORITY } from '../../domain';
import { DecisionCreationForm } from './DecisionCreationForm';
import {
  createDecisionCreationForm,
  createEmptyDecisionCreationErrors,
} from './DecisionCreationFormState';

const CURRENT_DATE = DayDate.create('2026-08-05');

function renderForm(overrides: Partial<Parameters<typeof DecisionCreationForm>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(DecisionCreationForm, {
      currentDate: CURRENT_DATE,
      form: createDecisionCreationForm(CURRENT_DATE),
      errors: createEmptyDecisionCreationErrors(),
      isSaving: false,
      onChange: vi.fn(),
      onClose: vi.fn(),
      onSubmit: vi.fn(),
      ...overrides,
    }),
  );
}

describe('DecisionCreationForm', () => {
  it('показывает все поля этапа 11.1 и дату не раньше текущей', () => {
    const markup = renderForm();

    expect(markup).toContain('Вид решения');
    expect(markup).toContain('Дата');
    expect(markup).toContain('Формулировка решения');
    expect(markup).toContain('Причина');
    expect(markup).toContain('Ожидаемый результат');
    expect(markup).toContain('Сфера');
    expect(markup).toContain('Цена решения');
    expect(markup).toContain('Жертвы');
    expect(markup).toContain('Приоритет');
    expect(markup).toContain('Связь с проектом');
    expect(markup).toContain('min="2026-08-05"');
    expect(markup).toContain('value="normal" selected=""');
    expect(markup).toContain('Создать решение');
  });

  it('объясняет различие главного и дополнительного решения', () => {
    const mainMarkup = renderForm();
    const additionalMarkup = renderForm({
      form: {
        ...createDecisionCreationForm(CURRENT_DATE),
        kind: DECISION_KIND.additional,
        priority: DECISION_PRIORITY.low,
      },
    });

    expect(mainMarkup).toContain('Главное решение займёт одну из трёх позиций');
    expect(additionalMarkup).toContain('Дополнительное решение не занимает главную позицию');
  });

  it('показывает ошибку рядом с полем и отмечает его как недопустимое', () => {
    const markup = renderForm({
      errors: {
        ...createEmptyDecisionCreationErrors(),
        title: 'Введите формулировку решения',
      },
    });

    expect(markup).toContain('id="decision-title-error"');
    expect(markup).toContain('Введите формулировку решения');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="decision-title-error"');
  });

  it('блокирует поля и команды во время сохранения', () => {
    const markup = renderForm({ isSaving: true });

    expect(markup).toContain('Сохраняем…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThan(5);
  });
});
