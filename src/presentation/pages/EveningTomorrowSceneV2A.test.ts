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
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const v2aMarker = '/* E11.3G-A: TomorrowScene visual fidelity V2A */';
const v2aCss = globalCss.slice(globalCss.lastIndexOf(v2aMarker));
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
    const context = activeSource.indexOf('tomorrow-scene-context-copy');
    const primary = activeSource.indexOf('Что действительно должно продвинуть день?');
    const outcomes = activeSource.indexOf('Границы результата');
    const firstStep = activeSource.indexOf('Первый шаг');
    const supporting = activeSource.indexOf('Дополнительные Решения');
    const contextualOutput = activeSource.indexOf('Контекстный вывод');
    const action = activeSource.indexOf('Подготовить завтра →');

    expect(context).toBeGreaterThan(-1);
    expect(primary).toBeGreaterThan(context);
    expect(outcomes).toBeGreaterThan(primary);
    expect(firstStep).toBeGreaterThan(outcomes);
    expect(supporting).toBeGreaterThan(firstStep);
    expect(contextualOutput).toBeGreaterThan(supporting);
    expect(action).toBeGreaterThan(contextualOutput);
    expect(activeSource).toContain('<EveningVisualIcon name="target"');
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
      /\.tomorrow-dashboard\s*\{[^}]*grid-template-areas:\s*'primary primary'\s*'outcomes outcomes'\s*'first supporting'\s*'context context'/,
    );
    expect(v2aCss).toMatch(
      /:is\(\s*\.tomorrow-primary-card,\s*\.tomorrow-first-action-card,\s*\.tomorrow-outcomes,\s*\.tomorrow-supporting\s*\)\s*\{[^}]*border:\s*0;/,
    );
    expect(v2aCss).toMatch(
      /\.tomorrow-primary-card\.is-empty\s*\{[^}]*min-height:\s*0;[^}]*place-items:\s*stretch;/,
    );
    expect(v2aCss).not.toContain('min-height: 6.6rem');
  });

  it('сохраняет Норму главным сегментом и расширяет поля по содержимому', () => {
    expect(v2aCss).toMatch(
      /\.tomorrow-outcome-boundaries\s*\{[^}]*grid-template-areas:\s*'minimum target stretch'/,
    );
    expect(v2aCss).toMatch(
      /\.tomorrow-outcome-segment\.is-target\s*\{[^}]*border:\s*1px solid #806027;[^}]*background:/,
    );
    expect(v2aCss).toMatch(/\.tomorrow-outcome-segment\.is-stretch\s*\{[^}]*opacity:\s*0\.58/);
    expect(v2aCss).toContain('field-sizing: content');
    expect(v2aCss).toContain('max-height: none');
    expect(v2aCss).not.toMatch(/max-height:\s*\d/);
    expect(v2aCss).not.toContain('overflow-y:');
  });

  it('задаёт точный mobile-порядок и не вводит горизонтальный scroll', () => {
    const mobileCss = v2aCss.slice(v2aCss.indexOf('@media (max-width: 48rem)'));

    expect(mobileCss).toMatch(
      /\.tomorrow-dashboard\s*\{[^}]*grid-template-areas:\s*'primary'\s*'outcomes'\s*'first'\s*'supporting'\s*'context'\s*'overload'\s*'error'\s*'actions';[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(mobileCss).toMatch(
      /\.tomorrow-outcome-boundaries[\s\S]*?grid-template-areas:\s*'target'\s*'minimum'\s*'stretch'/,
    );
    expect(mobileCss).toMatch(
      /\.tomorrow-scene-footer \.primary-button,[\s\S]*?width:\s*100%;[^}]*min-width:\s*0/,
    );
    expect(v2aCss).not.toMatch(/overflow-x:\s*(auto|scroll)/);
    expect(v2aCss).toContain('overflow-wrap: anywhere');
    expect(v2aCss).toMatch(
      /\.tomorrow-supporting-row strong\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(v2aCss).not.toMatch(/\n\.(?:tomorrow|evening-tomorrow)/);
  });

  it('заменяет completed/history строки тем же модульным каркасом и показывает реальные данные', () => {
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
    const primary = html.indexOf('Главное Решение');
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
    expect(completedSource).toContain('snapshot.supportingDecisions.slice(0, 2).map');
    expect(completedSource).not.toContain('в резерве дня');
    expect(completedSource).not.toContain('<table');
    expect(completedSource).not.toContain('<dl>');
    expect(completedSource).not.toContain('tomorrow-complete-sequence');
    expect(v2aCss).toMatch(
      /\.tomorrow-complete-plan\s*\{[^}]*grid-template-areas:\s*'primary primary'\s*'outcomes outcomes'\s*'lower lower'/,
    );
    expect(v2aCss).toMatch(
      /\.tomorrow-complete-lower-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 0\.92fr\) minmax\(0, 1\.08fr\)/,
    );

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

  it('показывает только предоставленный contextual strip и нумерует supporting Решения', () => {
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

    expect(html).toContain('Контекстный вывод');
    expect(html).toContain('Сегодня объём главного Решения оказался слишком большим.');
    expect(html).toContain('<span>02</span>');
    expect(html).toContain('<span>03</span>');
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
