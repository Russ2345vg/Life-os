import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import type { TomorrowPlanSnapshot } from '../../application';
import { DECISION_KIND, DayDate, EntityId, TOMORROW_PLAN_STATUS, TomorrowPlan } from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { TomorrowCompleteSummary } from './TomorrowComposer';
import {
  getTomorrowSceneEditorValues,
  getTomorrowSceneVisualState,
} from './TomorrowScenePresentation';

const tomorrowSource = readFileSync(new URL('./TomorrowComposer.tsx', import.meta.url), 'utf8');
const v2aCss = readFileSync(
  new URL('../styles/evening-tomorrow-form-v3.css', import.meta.url),
  'utf8',
);
const v2aMarker = '/* Evening Center v3 — step-specific Tomorrow working form.';
const activeSource = tomorrowSource.slice(
  tomorrowSource.indexOf('<form'),
  tomorrowSource.indexOf('function TomorrowCompleteSummary'),
);
const completedSource = tomorrowSource.slice(
  tomorrowSource.indexOf('function TomorrowCompleteSummary'),
  tomorrowSource.indexOf('function ComposerFrame'),
);
const TARGET_DATE = DayDate.create('2026-08-23');
const LONG_TARGET_OUTCOME = `Норма ${'с подробным проверяемым результатом '.repeat(20)}`.trim();

describe('E11.3G-A TomorrowScene V2A', () => {
  it('выстраивает активную сцену по иерархии референса', () => {
    const context = activeSource.indexOf('tomorrow-working-date');
    const primary = activeSource.indexOf('Главное решение');
    const outcomes = activeSource.indexOf('Граница результата');
    const firstStep = activeSource.indexOf('Первый шаг');
    const supporting = activeSource.indexOf('Дополнительные решения');
    const contextualOutput = activeSource.indexOf('Контекстный вывод');
    const action = activeSource.indexOf('Продолжить →');

    expect(context).toBeGreaterThan(-1);
    expect(primary).toBeGreaterThan(context);
    expect(outcomes).toBeGreaterThan(primary);
    expect(firstStep).toBeGreaterThan(outcomes);
    expect(supporting).toBeGreaterThan(firstStep);
    expect(contextualOutput).toBeGreaterThan(supporting);
    expect(action).toBeGreaterThan(contextualOutput);
    expect(activeSource).toContain('Изменить');
    expect(activeSource).toContain('supportingIds.slice(0, 2)');
  });

  it('не подменяет отсутствующие данные демонстрационными значениями или выводом из формы', () => {
    expect(activeSource).not.toContain('placeholder="LifeOS"');
    expect(activeSource).not.toContain('vector || tomorrowSceneLabel');
    expect(activeSource).not.toContain("?? 'Без проекта'");
    expect(activeSource).not.toContain("?? 'Первый шаг выбран'");
    expect(activeSource).not.toContain('Главное Решение и первый шаг определены.');
    expect(activeSource).not.toContain('Выберите центр завтрашнего дня.');
    expect(activeSource).not.toContain('Добавьте конкретный первый шаг.');
    expect(activeSource).toContain('snapshot.scopeTooLargeWarning && !isCompleted');
    expect(activeSource).toContain('snapshot.overloaded && !isCompleted');
    expect(activeSource).toContain('data-carried-primary={selectedPrimaryIsCarried');
    expect(activeSource).toContain('data-has-vector={vector.trim().length');
  });

  it('фиксирует empty, partial, ready, carried, overload, QUICK, loading и error hooks', () => {
    expect(
      getTomorrowSceneVisualState({
        primaryReady: false,
        minimumOutcome: '',
        firstActionReady: false,
      }),
    ).toBe('empty');
    expect(
      getTomorrowSceneVisualState({
        primaryReady: true,
        minimumOutcome: 'Минимальный результат',
        firstActionReady: false,
      }),
    ).toBe('partial');
    expect(
      getTomorrowSceneVisualState({
        primaryReady: true,
        minimumOutcome: 'Минимальный результат',
        firstActionReady: true,
      }),
    ).toBe('ready');
    expect(tomorrowSource).toContain('data-plan-state={visualState}');
    expect(tomorrowSource).toContain('data-overloaded={snapshot.overloaded');
    expect(tomorrowSource).toContain('mode === EVENING_CYCLE_MODE.quick');
    expect(tomorrowSource).toContain('className={`tomorrow-scene-state ${');
    expect(tomorrowSource).toContain("error === null ? 'status' : 'alert'");
    expect(tomorrowSource).toContain("error === null ? 'calendar' : 'ban'");
  });

  it('после сохранения заново синхронизирует созданные Решения и очищает creation-drafts', () => {
    const snapshot = createCompletedSnapshot();
    const values = getTomorrowSceneEditorValues(snapshot.plan);

    expect(values).toMatchObject({
      primaryId: 'tomorrow-primary',
      firstActionId: 'tomorrow-first-action',
      supportingIds: ['tomorrow-support-1', 'tomorrow-support-2'],
      newPrimaryTitle: '',
      newPrimaryResult: '',
      newSupportingTitle1: '',
      newSupportingTitle2: '',
      isCreatingPrimary: false,
      primaryChooserOpen: false,
      creatingSupportingSlots: [false, false],
    });
    expect(tomorrowSource).toContain('applySnapshotToEditor(current)');
    expect(tomorrowSource).toContain('applySnapshotToEditor(await service.getOrCreate(cycleDate))');
  });

  it('использует одну плановую поверхность и компактный empty hero', () => {
    expect(v2aCss).toContain(v2aMarker);
    expect(v2aCss).toMatch(
      /\.tomorrow-dashboard\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(v2aCss).toMatch(
      /data-scene='tomorrow'[\s\S]*?height:\s*clamp\(26rem, calc\(100vh - 18\.25rem\), 33rem\)/,
    );
    expect(v2aCss).toMatch(
      /data-scene='tomorrow'[\s\S]*?box-sizing:\s*border-box;[\s\S]*?padding:\s*0/,
    );
    expect(v2aCss).toMatch(
      /\.evening-tomorrow-scene\s*\{[^}]*grid-template-areas:\s*'body'\s*'actions';[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(v2aCss).toMatch(/\.tomorrow-working-form-scroll\s*\{[^}]*grid-area:\s*body/);
    expect(v2aCss).toMatch(/\.tomorrow-scene-footer\s*\{[^}]*grid-area:\s*actions/);
    expect(v2aCss).toMatch(/\.tomorrow-primary-empty-cta\s*\{[^}]*min-height:\s*3rem/);
    expect(v2aCss).not.toContain("'first supporting'");
  });

  it('показывает одну выбранную границу через общий segmented control', () => {
    expect(v2aCss).toMatch(
      /\.tomorrow-outcome-levels\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(v2aCss).toMatch(
      /\.tomorrow-outcome-levels > button\.is-selected\s*\{[^}]*color:\s*var\(--gold-soft\)/,
    );
    expect(activeSource).toContain('role="radiogroup"');
    expect(activeSource).toContain('role="radio"');
    expect(activeSource).toContain('workingForm.activeOutcome.value');
  });

  it('задаёт точный mobile-порядок и не вводит горизонтальный scroll', () => {
    const mobileCss = v2aCss.slice(v2aCss.indexOf('@media (max-width: 48rem)'));

    expect(mobileCss).toMatch(/data-scene='tomorrow'[\s\S]*?height:\s*42rem/);
    expect(mobileCss).toMatch(/\.tomorrow-inline-editor,[\s\S]*?minmax\(0, 1fr\)/);
    expect(mobileCss).toMatch(
      /\.tomorrow-scene-footer \.primary-button\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0/,
    );
    expect(v2aCss).not.toMatch(/overflow-x:\s*(auto|scroll)/);
    expect(v2aCss).toContain('overflow-wrap: anywhere');
  });

  it('показывает compact current summary и сохраняет подробный history-каркас', () => {
    const snapshot = createCompletedSnapshot();
    const html = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot,
        isQuick: false,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Вернуться к текущему этапу',
      }),
    );
    const primary = html.indexOf('Главное решение');
    const outcome = html.indexOf('Норма');
    const firstStep = html.indexOf('Первый шаг');
    const supporting = html.indexOf('Дополнительно');
    const action = html.indexOf('Вернуться к текущему этапу');

    expect(primary).toBeGreaterThan(-1);
    expect(outcome).toBeGreaterThan(primary);
    expect(firstStep).toBeGreaterThan(outcome);
    expect(supporting).toBeGreaterThan(firstStep);
    expect(action).toBeGreaterThan(supporting);
    expect(html).toContain(LONG_TARGET_OUTCOME);
    expect(html).toContain('Решение tomorrow-support-1');
    expect(html).toContain('Решение tomorrow-support-2');
    expect(html).not.toContain('Минимальный результат');
    expect(html).not.toContain('Максимальный результат');
    expect(completedSource).toContain('snapshot.supportingDecisions.slice(0, 2).map');
    expect(completedSource).not.toContain('в резерве дня');
    expect(completedSource).not.toContain('<table');
    expect(completedSource).not.toContain('<dl>');
    expect(completedSource).not.toContain('tomorrow-complete-sequence');

    const historyHtml = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot,
        isQuick: false,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Вернуться к текущему этапу',
        historyView: true,
      }),
    );
    expect(historyHtml).toContain('tomorrow-complete-summary is-history');
    expect(historyHtml).toContain('Минимальный результат');
    expect(historyHtml).toContain('Максимальный результат');
    expect(historyHtml).toContain('class="secondary-button is-ghost"');
    expect(historyHtml).not.toContain(
      'class="primary-button" type="button">Вернуться к текущему этапу',
    );

    const quickHtml = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot,
        isQuick: true,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Закрыть',
      }),
    );
    expect(quickHtml).toContain('Минимальный результат');
    expect(quickHtml).not.toContain(LONG_TARGET_OUTCOME);
    expect(quickHtml).not.toContain('Дополнительные Решения');
  });

  it('скрывает отсутствующий Vector и сохраняет нейтральные пустые границы без выдуманных данных', () => {
    const snapshot = withPlanOverrides(createCompletedSnapshot(), {
      vector: null,
      targetOutcome: null,
      stretchOutcome: null,
    });
    const html = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot: { ...snapshot, supportingDecisions: [] },
        isQuick: false,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Вернуться к текущему этапу',
        historyView: true,
      }),
    );

    expect(html).not.toContain('aria-label="Вектор дня"');
    expect(html.match(/Не задано/g)).toHaveLength(2);
    expect(html).toContain('Дополнительные Решения не добавлены');
    expect(html.indexOf('Норма')).toBeLessThan(html.indexOf('Минимум'));
    expect(html.indexOf('Минимум')).toBeLessThan(html.indexOf('Максимум'));
  });

  it('убирает contextual strip и нумерацию из current summary, сохраняя их в history', () => {
    const snapshot = createCompletedSnapshot();
    const html = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot: { ...snapshot, scopeTooLargeWarning: true },
        isQuick: false,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Закрыть',
      }),
    );

    expect(html).not.toContain('Контекстный вывод');
    expect(html).not.toContain('<span>02</span>');
    expect(html).not.toContain('<span>03</span>');

    const historyHtml = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot: { ...snapshot, scopeTooLargeWarning: true },
        isQuick: false,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Вернуться к текущему этапу',
        historyView: true,
      }),
    );
    expect(historyHtml).toContain('Контекстный вывод');
    expect(historyHtml).toContain('Сегодня объём главного Решения оказался слишком большим.');
    expect(historyHtml).toContain('<span>02</span>');
    expect(historyHtml).toContain('<span>03</span>');
  });
});

function withPlanOverrides(
  snapshot: TomorrowPlanSnapshot,
  overrides: {
    readonly vector?: string | null;
    readonly targetOutcome?: string | null;
    readonly stretchOutcome?: string | null;
  },
): TomorrowPlanSnapshot {
  const plan = snapshot.plan;
  return {
    ...snapshot,
    plan: TomorrowPlan.rehydrate({
      id: plan.id,
      cycleId: plan.cycleId,
      sourceDayId: plan.sourceDayId,
      targetDayId: plan.targetDayId,
      targetDateKey: plan.targetDateKey,
      directionId: plan.directionId,
      vector: overrides.vector === undefined ? plan.vector : overrides.vector,
      primaryDecisionId: plan.primaryDecisionId,
      minimumOutcome: plan.minimumOutcome,
      targetOutcome:
        overrides.targetOutcome === undefined ? plan.targetOutcome : overrides.targetOutcome,
      stretchOutcome:
        overrides.stretchOutcome === undefined ? plan.stretchOutcome : overrides.stretchOutcome,
      firstActionId: plan.firstActionId,
      firstAttentionItem: plan.firstAttentionItem,
      planningQuality: plan.planningQuality,
      supportingDecisionIds: plan.supportingDecisionIds,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      completedAt: plan.completedAt,
      version: plan.version,
    }),
  };
}

function createCompletedSnapshot(): TomorrowPlanSnapshot {
  const occurredAt = new Date('2026-08-22T12:00:00.000Z');
  const primary = createPlannedDecision('tomorrow-primary', TARGET_DATE, DECISION_KIND.main, 1);
  const supporting1 = createPlannedDecision(
    'tomorrow-support-1',
    TARGET_DATE,
    DECISION_KIND.additional,
  );
  const supporting2 = createPlannedDecision(
    'tomorrow-support-2',
    TARGET_DATE,
    DECISION_KIND.additional,
  );
  const firstAction = createReadyLifeAction('tomorrow-first-action', TARGET_DATE, {
    decisionId: primary.id,
  });
  const plan = TomorrowPlan.rehydrate({
    id: EntityId.create('tomorrow-plan'),
    cycleId: EntityId.create('tomorrow-cycle'),
    sourceDayId: EntityId.create('tomorrow-source-day'),
    targetDayId: EntityId.create('tomorrow-target-day'),
    targetDateKey: TARGET_DATE,
    directionId: null,
    vector: 'Закончить главное без перегруза',
    primaryDecisionId: primary.id,
    minimumOutcome: 'Минимальный результат',
    targetOutcome: LONG_TARGET_OUTCOME,
    stretchOutcome: 'Максимальный результат',
    firstActionId: firstAction.id,
    supportingDecisionIds: [supporting1.id, supporting2.id],
    status: TOMORROW_PLAN_STATUS.completed,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    completedAt: occurredAt,
    version: 8,
  });

  return {
    plan,
    primaryDecision: primary,
    firstAction,
    supportingDecisions: [supporting1, supporting2],
    carriedDecisionCandidate: null,
    scopeTooLargeWarning: false,
    targetDecisionCount: 3,
    targetLifeActionCount: 1,
    targetDecisions: [primary, supporting1, supporting2],
    targetLifeActions: [firstAction],
    overloaded: false,
  };
}
