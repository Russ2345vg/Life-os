import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, DECISION_KIND, EntityId } from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { TomorrowPlanningCenter } from './TomorrowPlanningCenter';
import {
  createTomorrowPlanPresentation,
  createTomorrowPlanningState,
  tomorrowPlanningReducer,
} from './TomorrowPlanningState';

const CURRENT_DATE = DayDate.create('2026-08-09');
const PLANNED_DATE = DayDate.create('2026-08-10');

function mainDecision(id: string, order = 1) {
  return createPlannedDecision(id, PLANNED_DATE, DECISION_KIND.main, order);
}

function additionalDecision(id: string) {
  return createPlannedDecision(id, PLANNED_DATE, DECISION_KIND.additional);
}

function renderCenter(decisions = createTomorrowPlanPresentation([]).decisions): string {
  return renderToStaticMarkup(
    createElement(TomorrowPlanningCenter, {
      currentDate: CURRENT_DATE,
      plannedDate: PLANNED_DATE,
      decisions,
      spheres: { active: [], archived: [] },
      createDecisionForDate: { execute: vi.fn() },
      updateDecisionDetails: { execute: vi.fn() },
      deleteDecisionSafely: { execute: vi.fn() },
      onDecisionsChange: vi.fn(),
      onBack: vi.fn(),
    }),
  );
}

describe('TomorrowPlanningCenter', () => {
  it('показывает пустой план, три подготовленных слота и причину блокировки сохранения', () => {
    const markup = renderCenter();

    expect(markup).toContain('Планирование завтра');
    expect(markup).toContain('0 из 3');
    expect(markup).toContain('Добавьте главное Решение');
    expect(markup).toContain('Добавьте главное решение');
    expect(markup).toContain('Добавьте второе решение');
    expect(markup).toContain('Добавьте третье решение');
    expect(markup).toContain('Добавьте хотя бы одно главное Решение');
    expect(markup).toContain('tomorrow-plan-primary" type="button" disabled=""');
  });

  it('показывает управляемый путь из трёх шагов и отмечает текущий шаг без зависимости от цвета', () => {
    const markup = renderCenter([mainDecision('guided-path')]);

    expect(markup).toContain('aria-label="Этапы формирования плана"');
    expect(markup).toContain('Главное решение');
    expect(markup).toContain('Второе решение');
    expect(markup).toContain('Третье решение');
    expect(markup).toContain('aria-current="step"');
    expect(markup.match(/class="tomorrow-plan-step /g)).toHaveLength(3);
  });

  it('сохраняет mobile-поток слоты плана → форма → итог → сохранение', () => {
    const markup = renderCenter();
    const slots = markup.indexOf('class="tomorrow-plan-slots"');
    const form = markup.indexOf('id="tomorrow-form-title"');
    const focus = markup.indexOf('id="tomorrow-focus-title"');
    const save = markup.indexOf('class="tomorrow-plan-primary"');

    expect(slots).toBeLessThan(form);
    expect(form).toBeLessThan(focus);
    expect(focus).toBeLessThan(save);
  });

  it('сводит количество решений и уникальных связанных целей в блоке Завтра в фокусе', () => {
    const sharedProjectId = EntityId.create('project-focus');
    const plan = [
      createPlannedDecision('focus-main', PLANNED_DATE, DECISION_KIND.main, 1, sharedProjectId),
      createPlannedDecision(
        'focus-additional',
        PLANNED_DATE,
        DECISION_KIND.additional,
        1,
        sharedProjectId,
      ),
    ];
    const markup = renderCenter(plan);

    expect(markup).toContain('Завтра в фокусе');
    expect(markup).toContain('2 решения');
    expect(markup).toContain('1 цель');
  });

  it('различает одно главное Решение и главное с дополнительным', () => {
    const one = createTomorrowPlanPresentation([mainDecision('main-one')]);
    const two = createTomorrowPlanPresentation([
      mainDecision('main-two'),
      additionalDecision('additional-two'),
    ]);

    expect(one).toMatchObject({ count: 1, hasMain: true, status: 'План формируется' });
    expect(two).toMatchObject({ count: 2, hasMain: true, status: 'План формируется' });
    expect(renderCenter(two.decisions)).toContain('2 из 3');
    expect(renderCenter(two.decisions)).toContain('Дополнительное');
  });

  it('показывает готовность, когда заполнены все три слота', () => {
    const plan = createTomorrowPlanPresentation([
      mainDecision('full-main', 1),
      additionalDecision('full-additional-one'),
      additionalDecision('full-additional-two'),
    ]);
    const markup = renderCenter(plan.decisions);

    expect(plan).toMatchObject({ count: 3, progress: 100, status: 'План готов' });
    expect(markup).toContain('3 из 3');
    expect(markup).toContain('Все три места заполнены');
    expect(markup).not.toContain('Добавьте ещё одно Решение');
  });

  it('оставляет сохранение недоступным, если план состоит только из дополнительных Решений', () => {
    const plan = createTomorrowPlanPresentation([
      additionalDecision('only-additional-one'),
      additionalDecision('only-additional-two'),
    ]);
    const markup = renderCenter(plan.decisions);

    expect(plan.hasMain).toBe(false);
    expect(plan.status).toBe('Добавьте главное Решение');
    expect(markup).toContain('tomorrow-plan-primary" type="button" disabled=""');
  });

  it('переводит ту же форму в редактирование и возвращает её к созданию после сохранения', () => {
    const decision = mainDecision('editing');
    const initial = createTomorrowPlanningState(PLANNED_DATE);
    const editing = tomorrowPlanningReducer(initial, {
      type: 'edit_requested',
      decision,
      plannedDate: PLANNED_DATE,
    });
    const saved = tomorrowPlanningReducer(editing, {
      type: 'edit_succeeded',
      plannedDate: PLANNED_DATE,
    });

    expect(editing.mode).toEqual({ kind: 'edit', decision });
    expect(editing.form.title).toBe('Решение editing');
    expect(saved.mode).toEqual({ kind: 'create' });
    expect(saved.form.title).toBe('');
    expect(saved.notice).toBe('Изменения сохранены');
  });

  it('подтверждает добавление, удаление и сохранение плана без перезагрузки состояния', () => {
    const decision = mainDecision('delete');
    const initial = createTomorrowPlanningState(PLANNED_DATE);
    const added = tomorrowPlanningReducer(initial, {
      type: 'create_succeeded',
      plannedDate: PLANNED_DATE,
    });
    const deleting = tomorrowPlanningReducer(added, { type: 'delete_requested', decision });
    const deleted = tomorrowPlanningReducer(deleting, {
      type: 'delete_succeeded',
      plannedDate: PLANNED_DATE,
    });
    const saved = tomorrowPlanningReducer(deleted, { type: 'plan_saved' });

    expect(added.notice).toBe('Решение добавлено');
    expect(deleting.deleteCandidate).toBe(decision);
    expect(deleted.deleteCandidate).toBeNull();
    expect(deleted.notice).toBe('Решение удалено из плана');
    expect(saved.notice).toBe('План на завтра сохранён');
  });

  it('содержит единственную золотую команду и не дублирует рабочий модуль экрана Сегодня', () => {
    const markup = renderCenter([mainDecision('single-command')]);

    expect(markup.match(/tomorrow-plan-primary/g)).toHaveLength(1);
    expect(markup.match(/Сохранить план на завтра/g)).toHaveLength(1);
    expect(markup).toContain('data-evening-icon="arrow-right"');
    expect(markup).not.toContain('today-workspace');
    expect(markup).not.toContain('Командный модуль');
  });
});
