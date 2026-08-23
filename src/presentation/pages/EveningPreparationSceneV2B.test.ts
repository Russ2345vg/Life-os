import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import type { PreparationSnapshot } from '../../application';
import {
  ActionExpectedResult,
  DayDate,
  DECISION_KIND,
  EntityId,
  EVENING_CYCLE_MODE,
  LifeAction,
  LifeActionTitle,
  PREPARATION_CATEGORY,
  PREPARATION_PLAN_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  PreparationPlan,
  Project,
  type EveningCycleMode,
  type PreparationCategory,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { PreparationSceneState, PreparationSceneView } from './PreparationPanel';

const DATE = DayDate.create('2026-08-22');
const NOW = new Date('2026-08-21T12:00:00.000Z');
const PLAN_ID = EntityId.create('v2b-preparation-plan');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const v2bMarker = '/* E11.3G-B: PreparationScene visual fidelity V2B */';
const v2bCss = globalCss.slice(globalCss.lastIndexOf(v2bMarker));
const preparationSource = readFileSync(new URL('./PreparationPanel.tsx', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('./EveningReviewPanel.tsx', import.meta.url), 'utf8');

describe('E11.3G-B PreparationScene loaded states', () => {
  it('показывает компактный empty active с одной CTA, а history — без CTA', () => {
    const project = Project.create({
      id: EntityId.create('v2b-empty-project'),
      title: 'Проект пустой подготовки',
      now: NOW,
    });
    const decision = createPlannedDecision(
      'v2b-empty-main',
      DATE,
      DECISION_KIND.main,
      1,
      project.id,
    );
    const snapshot = preparationSnapshot([], { primaryDecision: decision, project });
    const active = renderScene(snapshot);
    const history = renderScene(snapshot, { completedReview: true });

    expect(active).toContain('Всё готово');
    expect(active).toContain('Для завтрашнего старта дополнительная подготовка не нужна.');
    expect(active).toContain('Первый шаг уже определён.');
    expect(active).toContain('Перейти к завершению →');
    expect(active).toContain('0 из 0');
    expect(active).toContain('role="progressbar"');
    expect(active.match(/<button/g)).toHaveLength(1);

    expect(history).toContain('Сохранённая подготовка');
    expect(history).toContain('Дополнительных пунктов подготовки не требовалось.');
    expect(history.match(/Дополнительных пунктов подготовки не требовалось\./g)).toHaveLength(1);
    expect(history.match(/preparation-success-state/g)).toHaveLength(1);
    expect(history).toContain('data-history-empty="true"');
    expect(history).not.toContain('0 из 0');
    expect(history).not.toContain('Было подготовлено');
    expect(history).not.toContain('Краткая сводка готовности');
    expect(history).not.toContain('role="progressbar"');
    expect(history).not.toContain('Первый шаг был определён.');
    expect(history).not.toContain('<button');
    expect(history).not.toContain('Сохранить подготовку');

    const actionIndex = history.indexOf('Действие default-first');
    const resultIndex = history.indexOf('Результат default-first');
    const decisionIndex = history.indexOf('Решение v2b-empty-main');
    expect(actionIndex).toBeGreaterThan(-1);
    expect(resultIndex).toBeGreaterThan(actionIndex);
    expect(decisionIndex).toBeGreaterThan(resultIndex);
  });

  it('блокирует переход только pending-required и разрешает optional либо skipped required', () => {
    const required = preparationItem('обязательный', true, PREPARATION_CATEGORY.digital);
    const optional = preparationItem('дополнительный', false, PREPARATION_CATEGORY.physical);
    const blocked = renderScene(preparationSnapshot([required, optional]));
    const optionalOnlyPending = renderScene(
      preparationSnapshot([required.complete(NOW), optional]),
    );
    const consciouslySkipped = renderScene(
      preparationSnapshot([required.skip(NOW, 'Проверено'), optional]),
    );

    expect(blocked).toContain('Нужно для первого старта');
    expect(blocked).toContain('Можно подготовить дополнительно');
    expect(blocked).toContain('Ожидает · Нужно для первого старта');
    expect(blocked).toMatch(/class="primary-button preparation-scene-action"[^>]*disabled/);
    expect(optionalOnlyPending).not.toMatch(
      /class="primary-button preparation-scene-action"[^>]*disabled/,
    );
    expect(consciouslySkipped).toContain('Осознанно пропущено');
    expect(consciouslySkipped).not.toMatch(
      /class="primary-button preparation-scene-action"[^>]*disabled/,
    );
  });

  it('сохраняет категории в порядке digital → physical → additional и скрывает пустые', () => {
    const markup = renderScene(
      preparationSnapshot([
        preparationItem('физический', true, PREPARATION_CATEGORY.physical),
        preparationItem('дополнительный', false, PREPARATION_CATEGORY.cognitive),
        preparationItem('цифровой', true, PREPARATION_CATEGORY.digital),
      ]),
    );
    const digital = markup.indexOf('data-category="digital"');
    const physical = markup.indexOf('data-category="physical"');
    const additional = markup.indexOf('data-category="cognitive"');

    expect(digital).toBeGreaterThan(-1);
    expect(physical).toBeGreaterThan(digital);
    expect(additional).toBeGreaterThan(physical);
    expect(markup).toContain('preparation-sections-3');

    const oneCategory = renderScene(
      preparationSnapshot([preparationItem('только один', true, PREPARATION_CATEGORY.digital)]),
    );
    expect(oneCategory).toContain('preparation-sections-1');
    expect(oneCategory).not.toContain('data-category="physical"');
    expect(oneCategory).not.toContain('data-category="cognitive"');
    expect(oneCategory.match(/<li data-tone=/g)).toHaveLength(2);
  });

  it('не применяет empty-полировку к history с одним пунктом, partial и fully completed', () => {
    const oneItem = renderScene(
      preparationSnapshot([preparationItem('один', true, PREPARATION_CATEGORY.digital)]),
      { completedReview: true },
    );
    const partiallyCompleted = renderScene(
      preparationSnapshot([
        preparationItem('готовый', true, PREPARATION_CATEGORY.digital).complete(NOW),
        preparationItem('ожидающий', true, PREPARATION_CATEGORY.physical),
      ]),
      { completedReview: true },
    );
    const fullyCompleted = renderScene(
      preparationSnapshot([
        preparationItem('готовый digital', true, PREPARATION_CATEGORY.digital).complete(NOW),
        preparationItem('готовый additional', false, PREPARATION_CATEGORY.cognitive).complete(NOW),
      ]),
      { completedReview: true },
    );

    expect(oneItem).not.toContain('data-history-empty="true"');
    expect(oneItem).toContain('preparation-sections-1');
    expect(oneItem).toContain('Краткая сводка готовности');
    expect(oneItem).toContain('Было подготовлено 0 из 1');

    expect(partiallyCompleted).toContain('preparation-sections-2');
    expect(partiallyCompleted).toContain('data-category="digital"');
    expect(partiallyCompleted).toContain('data-category="physical"');
    expect(partiallyCompleted).toContain('Было подготовлено 1 из 2');
    expect(partiallyCompleted).toContain('role="progressbar"');

    expect(fullyCompleted).toContain('preparation-sections-2');
    expect(fullyCompleted).toContain('data-category="digital"');
    expect(fullyCompleted).toContain('data-category="cognitive"');
    expect(fullyCompleted).toContain('Было подготовлено 2 из 2');
    expect(fullyCompleted).toContain('data-ready="true"');
  });

  it('строит первый старт только из snapshot и не выводит fallback-Решение или время', () => {
    const project = Project.create({
      id: EntityId.create('v2b-project'),
      title: 'Проект запуска',
      now: NOW,
    });
    const decision = createPlannedDecision('v2b-main', DATE, DECISION_KIND.main, 1, project.id);
    const firstAction = createReadyLifeAction('v2b-first', DATE, {
      decisionId: decision.id,
      description: 'Открыть подготовленное рабочее пространство.',
    });
    const full = renderScene(
      preparationSnapshot([], { firstAction, primaryDecision: decision, project }),
    );
    const absent = renderScene(
      preparationSnapshot([], {
        firstAction: null,
        primaryDecision: null,
        project: null,
      }),
    );

    expect(full).toContain('Действие v2b-first');
    expect(full).toContain('Результат v2b-first');
    expect(full).toContain('Открыть подготовленное рабочее пространство.');
    expect(full).toContain('Проект запуска');
    expect(full).toContain('Решение v2b-main');
    expect(full).not.toContain('07:30');

    expect(absent).toContain('Первый шаг не определён');
    expect(absent).not.toContain('Первый шаг уже определён');
    expect(absent).not.toContain('главное Решение');
    expect(absent).not.toContain('Без проекта');
  });

  it('фильтрует QUICK до required и считает ту же видимую выборку', () => {
    const markup = renderScene(
      preparationSnapshot([
        preparationItem('required-quick', true, PREPARATION_CATEGORY.digital).complete(NOW),
        preparationItem('OPTIONAL-UNIQUE', false, PREPARATION_CATEGORY.cognitive),
      ]),
      { mode: EVENING_CYCLE_MODE.quick },
    );

    expect(markup).toContain('Подготовить required-quick');
    expect(markup).not.toContain('OPTIONAL-UNIQUE');
    expect(markup).toMatch(/Подготовлено[\s\S]*?1[\s\S]*?из[\s\S]*?1/);
    expect(markup).toContain('aria-valuenow="100"');
  });

  it('не заменяет fully-ready реальные пункты придуманным checklist', () => {
    const markup = renderScene(
      preparationSnapshot([
        preparationItem('готовый digital', true, PREPARATION_CATEGORY.digital).complete(NOW),
        preparationItem('готовый physical', true, PREPARATION_CATEGORY.physical).complete(NOW),
      ]),
    );

    expect(markup).toContain('Подготовить готовый digital');
    expect(markup).toContain('Подготовить готовый physical');
    expect(markup).toContain('data-ready="true"');
    expect(markup).toContain('Выполнено');
    expect(markup).not.toContain('Среда готова');
    expect(markup).not.toContain('Утром можно начинать без дополнительного планирования.');
  });

  it('сохраняет history-иерархию и только вторичное редактирование', () => {
    const item = preparationItem('history', true, PREPARATION_CATEGORY.digital).complete(NOW);
    const readOnly = renderScene(preparationSnapshot([item]), { completedReview: true });
    const editing = renderScene(preparationSnapshot([item]), {
      completedReview: true,
      completedReviewEditing: true,
    });

    expect(readOnly.indexOf('Первый старт был определён')).toBeLessThan(
      readOnly.indexOf('Краткая сводка готовности'),
    );
    expect(readOnly.indexOf('Краткая сводка готовности')).toBeLessThan(
      readOnly.indexOf('data-category="digital"'),
    );
    expect(readOnly).toContain('Было подготовлено');
    expect(readOnly).toContain('Изменить подготовку');
    expect(readOnly).not.toContain('primary-button preparation-scene-action');
    expect(readOnly).not.toContain('Сохранить подготовку');
    expect(editing).toContain('Завершить редактирование');
    expect(editing).not.toContain('Сохранить подготовку');
  });

  it('сохраняет длинные реальные тексты полностью', () => {
    const actionTitle = `Первый старт ${'очень конкретное действие '.repeat(7)}`.trim();
    const expectedResult = `Ожидаемый результат ${'проверяемый результат '.repeat(7)}`.trim();
    const itemTitle = `Подготовить ${'длинное название препятствия '.repeat(6)}`.trim();
    const projectTitle = `Проект ${'устойчивого запуска '.repeat(7)}`.trim();
    const firstAction = longFirstAction(actionTitle, expectedResult);
    const project = Project.create({
      id: EntityId.create('v2b-long-project'),
      title: projectTitle,
      now: NOW,
    });
    const markup = renderScene(
      preparationSnapshot(
        [preparationItem(itemTitle, true, PREPARATION_CATEGORY.digital, itemTitle)],
        { firstAction, project },
      ),
    );

    expect(markup).toContain(actionTitle);
    expect(markup).toContain(expectedResult);
    expect(markup).toContain(itemTitle);
    expect(markup).toContain(projectTitle);
  });
});

describe('E11.3G-B loading, late and responsive contracts', () => {
  it('рендерит отдельные loading/error состояния с повтором', () => {
    const loading = renderToStaticMarkup(PreparationSceneState({ status: 'loading' }));
    const error = renderToStaticMarkup(
      PreparationSceneState({
        status: 'error',
        message: 'Сбой read model',
        onRetry: vi.fn(),
      }),
    );

    expect(loading).toContain('role="status"');
    expect(loading).toContain('Собираем подготовку к первому старту…');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Сбой read model');
    expect(error).toContain('Повторить');
  });

  it('не меняет отдельный late-flow и его команду пропуска', () => {
    expect(reviewSource).toContain('EmergencyPreparationSkipPanel');
    expect(reviewSource).toContain('eveningCycle.skipPreparation');
    expect(reviewSource).toContain('Позднее завершение · Подготовка');
  });

  it('фиксирует scoped V2B cascade, desktop widths и mobile stack без internal scroll', () => {
    const desktopWidths = [1600, 1440, 1280, 1024] as const;
    const mobileViewports = ['390×844', '360×800'] as const;

    expect(desktopWidths.every((width) => width >= 1024)).toBe(true);
    expect(mobileViewports).toEqual(['390×844', '360×800']);
    expect(v2bCss.startsWith(v2bMarker)).toBe(true);
    expect(v2bCss).not.toMatch(/\n\.preparation-/);
    expect(v2bCss).toContain('min-width: 0;');
    expect(v2bCss).toContain('overflow-wrap: anywhere;');
    expect(v2bCss).not.toMatch(/overflow-x:\s*(?:auto|scroll)/);
    expect(v2bCss).not.toMatch(/overflow-y:|max-height:|100vh/);
    expect(v2bCss).toMatch(/\.preparation-sections-1\s*{[^}]*width:\s*min\(100%, 34rem\)/);
    expect(v2bCss).toMatch(
      /\.evening-command-center-page \.evening-preparation-scene\s*{[^}]*border:\s*0;[^}]*background:\s*transparent/,
    );
    expect(v2bCss).toMatch(
      /\.evening-command-center-page \.preparation-workspace\s*{[^}]*border:\s*1px solid var\(--evening-v1-border-strong\)/,
    );
    expect(v2bCss).toMatch(
      /\.evening-preparation-scene\[data-scene-mode='history'\]\[data-history-empty='true'\]\s*{[^}]*width:\s*min\(100%, 52rem\);[^}]*justify-self:\s*start/,
    );
    expect(v2bCss).toMatch(
      /\.evening-command-center-page \.preparation-summary-strip\s*{[^}]*grid-template-columns:\s*minmax\(10\.5rem, 0\.65fr\) minmax\(0, 1\.35fr\)/,
    );
    expect(v2bCss).toMatch(
      /\.evening-command-center-page \.evening-preparation-scene \.preparation-category,[\s\S]*?min-height:\s*0;[\s\S]*?border-radius:\s*var\(--evening-v1-radius-md\)/,
    );
    expect(v2bCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.preparation-sections-3[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(v2bCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.preparation-readiness[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(v2bCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.preparation-summary-strip\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(v2bCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\[data-history-empty='true'\]\s*{[^}]*width:\s*100%/,
    );
    expect(preparationSource.indexOf('preparation-first-start')).toBeLessThan(
      preparationSource.indexOf('<PreparationSummaryStrip'),
    );
    expect(preparationSource.indexOf('<PreparationSummaryStrip')).toBeLessThan(
      preparationSource.indexOf('preparation-sections'),
    );
    expect(preparationSource.indexOf('preparation-sections')).toBeLessThan(
      preparationSource.indexOf('preparation-readiness'),
    );
  });
});

function renderScene(
  snapshot: PreparationSnapshot,
  options: Readonly<{
    mode?: EveningCycleMode;
    completedReview?: boolean;
    completedReviewEditing?: boolean;
  }> = {},
): string {
  return renderToStaticMarkup(
    PreparationSceneView({
      snapshot,
      mode: options.mode ?? EVENING_CYCLE_MODE.normal,
      completedReview: options.completedReview ?? false,
      completedReviewEditing: options.completedReviewEditing ?? false,
      busyItemId: null,
      isContinuing: false,
      onProcess: async () => undefined,
      onContinue: async () => undefined,
      onReviewEditingChange: vi.fn(),
    }),
  );
}

function preparationSnapshot(
  items: readonly PreparationItem[],
  context: Partial<Pick<PreparationSnapshot, 'firstAction' | 'primaryDecision' | 'project'>> = {},
): PreparationSnapshot {
  return {
    plan: PreparationPlan.rehydrate({
      id: PLAN_ID,
      cycleId: EntityId.create('v2b-cycle'),
      tomorrowPlanId: EntityId.create('v2b-tomorrow-plan'),
      targetDayId: EntityId.create('v2b-target-day'),
      items,
      sourceVersion: 1,
      generationSignature: 'v2b-fixture',
      status: PREPARATION_PLAN_STATUS.inProgress,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      version: 1,
    }),
    firstAction:
      'firstAction' in context
        ? (context.firstAction ?? null)
        : createReadyLifeAction('default-first', DATE),
    primaryDecision: context.primaryDecision ?? null,
    project: context.project ?? null,
  };
}

function preparationItem(
  key: string,
  required: boolean,
  category: PreparationCategory,
  title = `Подготовить ${key}`,
): PreparationItem {
  return PreparationItem.create({
    id: EntityId.create(`v2b-item-${key.slice(0, 20).replaceAll(' ', '-')}`),
    planId: PLAN_ID,
    key,
    category,
    title,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required,
  });
}

function longFirstAction(title: string, expectedResult: string): LifeAction {
  const action = LifeAction.createDraft({
    id: EntityId.create('v2b-long-action'),
    title: LifeActionTitle.create(title),
    createdAt: NOW,
    eventId: EntityId.create('v2b-long-action-draft'),
  });
  action.makeReady({
    expectedResult: ActionExpectedResult.create(expectedResult),
    plannedDate: DATE,
    occurredAt: NOW,
    eventId: EntityId.create('v2b-long-action-ready'),
  });
  return action;
}
