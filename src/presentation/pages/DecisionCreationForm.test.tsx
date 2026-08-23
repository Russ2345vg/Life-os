import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, DECISION_KIND, DECISION_PRIORITY, EntityId, Project } from '../../domain';
import { DecisionCreationDialog, DecisionCreationForm } from './DecisionCreationForm';
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
    expect(markup).toContain('Проект');
    expect(markup).toContain('Цена решения');
    expect(markup).toContain('Жертвы');
    expect(markup).toContain('Приоритет');
    expect(markup).toContain('Связь с проектом');
    expect(markup).toContain('min="2026-08-05"');
    expect(markup).toContain('value="normal" selected=""');
    expect(markup).toContain('Создать решение');
  });

  it('предлагает для нового решения только незавершённые и неархивные проекты', () => {
    const active = Project.create({
      id: EntityId.create('active'),
      title: 'Активный',
      now: new Date(),
    });
    const paused = Project.create({
      id: EntityId.create('paused'),
      title: 'На паузе',
      now: new Date(),
    }).pause(new Date());
    const completed = Project.create({
      id: EntityId.create('completed'),
      title: 'Завершённый',
      now: new Date(),
    }).complete(new Date());
    const archived = Project.create({
      id: EntityId.create('archived'),
      title: 'Архивный',
      now: new Date(),
    }).archive(new Date());

    const markup = renderForm({ projects: [active, paused, completed, archived] });

    expect(markup).toContain('Активный');
    expect(markup).toContain('На паузе');
    expect(markup).not.toContain('Завершённый');
    expect(markup).not.toContain('Архивный');
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
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThan(5);
  });

  it('использует общий премиальный modal shell и компактную сетку полей', () => {
    const markup = renderToStaticMarkup(
      createElement(DecisionCreationDialog, {
        currentDate: CURRENT_DATE,
        form: createDecisionCreationForm(CURRENT_DATE),
        errors: createEmptyDecisionCreationErrors(),
        isSaving: false,
        onChange: vi.fn(),
        onClose: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('premium-form-dialog decision-form-dialog');
    expect(markup).toContain('premium-form-grid');
    expect(markup).toContain('aria-label="Закрыть форму решения"');
  });
});
