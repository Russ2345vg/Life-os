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
import { PREPARATION_AREA, type PreparationArea } from '../../domain/preparation';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { PreparationSceneState, PreparationSceneView } from './PreparationPanel';

const DATE = DayDate.create('2026-08-22');
const NOW = new Date('2026-08-21T12:00:00.000Z');
const PLAN_ID = EntityId.create('v2b-preparation-plan');
const environmentCss = readFileSync(new URL('../styles/evening-environment.css', import.meta.url), 'utf8');
const preparationSource = readFileSync(new URL('./PreparationPanel.tsx', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const v2bCss = globalCss.slice(globalCss.lastIndexOf('/* E11.3G-B: PreparationScene visual fidelity V2B */'));
const reviewSource = readFileSync(new URL('./EveningReviewPanel.tsx', import.meta.url), 'utf8');

describe('R4 Environment PreparationScene', () => {
  it('группирует активный checklist по среде сна, затем по среде завтра', () => {
    const markup = renderScene(preparationSnapshot(coreItems()));

    const sleep = markup.indexOf('data-area="sleep_environment"');
    const tomorrow = markup.indexOf('data-area="tomorrow_start"');
    expect(sleep).toBeGreaterThan(-1);
    expect(tomorrow).toBeGreaterThan(sleep);
    expect(markup).toContain('Среда для сна');
    expect(markup).toContain('Среда для завтра');
  });

  it('показывает явные complete и skip actions для pending и текстовый статус обработанного required', () => {
    const items = [
      preparationItem('pending', true, PREPARATION_CATEGORY.physical, PREPARATION_AREA.sleepEnvironment),
      preparationItem('skipped', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart).skip(
        NOW,
        'Сегодня не требуется',
      ),
      preparationItem('third', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
      preparationItem('fourth', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
    ];
    const markup = renderScene(preparationSnapshot(items));

    expect(markup).toContain('Выполнено');
    expect(markup).toContain('Пропустить сегодня');
    expect(markup).toContain('Обязательное ядро');
    expect(markup).toContain('Осознанно пропущено');
    expect(markup.match(/Осознанно пропущено/g)).toHaveLength(1);
    expect(markup.indexOf('Подготовить skipped')).toBeGreaterThan(markup.indexOf('Подготовить pending'));
  });

  it('не блокирует continuation для skipped required и pending optional', () => {
    const items = [
      preparationItem('required', true, PREPARATION_CATEGORY.physical, PREPARATION_AREA.sleepEnvironment).skip(NOW),
      preparationItem('optional', false, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
      preparationItem('third', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart).complete(NOW),
      preparationItem('fourth', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart).complete(NOW),
    ];
    const markup = renderScene(preparationSnapshot(items));

    expect(markup).not.toMatch(/class="primary-button preparation-scene-action"[^>]*disabled/);
  });

  it('оставляет loading/error доступными и не добавляет Environment flow в emergency mode', () => {
    const loading = renderToStaticMarkup(PreparationSceneState({ status: 'loading' }));
    const error = renderToStaticMarkup(
      PreparationSceneState({ status: 'error', message: 'Сбой read model', onRetry: vi.fn() }),
    );
    const emergency = renderScene(preparationSnapshot(coreItems()), { mode: EVENING_CYCLE_MODE.emergency });

    expect(loading).toContain('role="status"');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Повторить');
    expect(emergency).not.toContain('Настроить ядро');
  });

  it('разделяет initial empty и сохранённый history empty без возврата category-first UI', () => {
    const active = renderScene(preparationSnapshot([], { coreConfigured: false }));
    const history = renderScene(preparationSnapshot([], { coreConfigured: false }), {
      completedReview: true,
    });

    expect(active).toContain('Настройте обязательное ядро');
    expect(active).not.toContain('data-category=');
    expect(history).toContain('Сохранённая подготовка');
    expect(history).toContain('Дополнительных пунктов подготовки не требовалось.');
    expect(history).not.toContain('role="progressbar"');
    expect(history).not.toContain('<button');
  });

  it('сохраняет first-start, project и decision контекст из snapshot', () => {
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
    const markup = renderScene(
      preparationSnapshot(coreItems(), { firstAction, primaryDecision: decision, project }),
    );

    expect(markup).toContain('Действие v2b-first');
    expect(markup).toContain('Результат v2b-first');
    expect(markup).toContain('Открыть подготовленное рабочее пространство.');
    expect(markup).toContain('Проект запуска');
    expect(markup).toContain('Решение v2b-main');
    expect(markup).not.toContain('07:30');
  });

  it('фильтрует QUICK до configured required и сохраняет длинные snapshot texts', () => {
    const actionTitle = `Первый старт ${'очень конкретное действие '.repeat(7)}`.trim();
    const expectedResult = `Ожидаемый результат ${'проверяемый результат '.repeat(7)}`.trim();
    const itemTitle = `Подготовить ${'длинное название препятствия '.repeat(6)}`.trim();
    const projectTitle = `Проект ${'устойчивого запуска '.repeat(7)}`.trim();
    const project = Project.create({ id: EntityId.create('v2b-long-project'), title: projectTitle, now: NOW });
    const items = [
      preparationItem('required-a', true, PREPARATION_CATEGORY.physical, PREPARATION_AREA.sleepEnvironment),
      preparationItem('required-b', true, PREPARATION_CATEGORY.physical, PREPARATION_AREA.sleepEnvironment),
      preparationItem('required-c', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
      preparationItem('OPTIONAL-UNIQUE', false, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
      preparationItem(
        'long-copy',
        true,
        PREPARATION_CATEGORY.digital,
        PREPARATION_AREA.tomorrowStart,
        itemTitle,
      ),
    ];
    const markup = renderScene(
      preparationSnapshot(items, { firstAction: longFirstAction(actionTitle, expectedResult), project }),
      { mode: EVENING_CYCLE_MODE.quick },
    );

    expect(markup).toContain('Подготовить required-a');
    expect(markup).not.toContain('OPTIONAL-UNIQUE');
    expect(markup).toContain(actionTitle);
    expect(markup).toContain(expectedResult);
    expect(markup).toContain(projectTitle);
    expect(markup).toContain(itemTitle);
  });

  it('сохраняет late-flow isolation и применимые V2B responsive contracts', () => {
    expect(reviewSource).toContain('EmergencyPreparationSkipPanel');
    expect(reviewSource).toContain('eveningCycle.skipPreparation');
    expect(reviewSource).toContain('Позднее завершение · Подготовка');
    expect(v2bCss).toContain('min-width: 0;');
    expect(v2bCss).toContain('overflow-wrap: anywhere;');
    expect(v2bCss).not.toMatch(/overflow-x:\s*(?:auto|scroll)/);
    expect(v2bCss).toMatch(/@media \(max-width: 48rem\)[\s\S]*?\.preparation-readiness[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(preparationSource.indexOf('preparation-first-start')).toBeLessThan(
      preparationSource.indexOf('<PreparationSummaryStrip'),
    );
    expect(preparationSource.indexOf('<PreparationSummaryStrip')).toBeLessThan(
      preparationSource.indexOf('preparation-environment-areas'),
    );
  });

  it('фиксирует Environment CSS: grid, mobile, touch, focus и reduced motion', () => {
    expect(environmentCss).toContain('.preparation-environment-areas');
    expect(environmentCss).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(environmentCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(environmentCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?min-height:\s*44px/);
    expect(environmentCss).toContain('min-height: 2.75rem');
    expect(environmentCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.preparation-core-edit[\s\S]*?min-height:\s*44px/,
    );
    expect(environmentCss).toMatch(
      /\.preparation-core-error \.text-button\s*{[\s\S]*?min-height:\s*2\.75rem/,
    );
    expect(environmentCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.preparation-core-error \.text-button[\s\S]*?width:\s*100%[\s\S]*?min-height:\s*44px/,
    );
    expect(environmentCss).not.toContain('--control-lg');
    expect(environmentCss).not.toContain('--control-md');
    expect(environmentCss).toContain(':focus-visible');
    expect(environmentCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(environmentCss).not.toMatch(/overflow-x:\s*(?:auto|scroll)/);
    expect(preparationSource).toContain("import '../styles/evening-environment.css'");
  });
});

function renderScene(
  snapshot: PreparationSnapshot,
  options: Readonly<{ mode?: EveningCycleMode; completedReview?: boolean }> = {},
): string {
  return renderToStaticMarkup(
    PreparationSceneView({
      snapshot,
      mode: options.mode ?? EVENING_CYCLE_MODE.normal,
      completedReview: options.completedReview ?? false,
      completedReviewEditing: false,
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
  context: Partial<Pick<PreparationSnapshot, 'firstAction' | 'primaryDecision' | 'project'>> &
    Readonly<{ coreConfigured?: boolean }> = {},
): PreparationSnapshot {
  const requiredCoreKeys = items.filter((item) => item.required).map((item) => item.key);
  const coreConfigured = context.coreConfigured ?? true;
  return {
    plan: PreparationPlan.rehydrate({
      id: PLAN_ID,
      cycleId: EntityId.create('v2b-cycle'),
      tomorrowPlanId: EntityId.create('v2b-tomorrow-plan'),
      targetDayId: EntityId.create('v2b-target-day'),
      items,
      requiredCoreKeys: coreConfigured ? requiredCoreKeys : null,
      sourceVersion: 1,
      generationSignature: 'v2b-fixture',
      status: PREPARATION_PLAN_STATUS.inProgress,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      version: 1,
    }),
    recommendedCoreKeys: requiredCoreKeys,
    firstAction: context.firstAction ?? null,
    primaryDecision: context.primaryDecision ?? null,
    project: context.project ?? null,
  };
}

function coreItems(): readonly PreparationItem[] {
  return [
    preparationItem('sleep-one', true, PREPARATION_CATEGORY.physical, PREPARATION_AREA.sleepEnvironment),
    preparationItem('sleep-two', true, PREPARATION_CATEGORY.physical, PREPARATION_AREA.sleepEnvironment),
    preparationItem('tomorrow-one', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
    preparationItem('tomorrow-two', true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
  ];
}

function preparationItem(
  key: string,
  required: boolean,
  category: PreparationCategory,
  area: PreparationArea,
  title = `Подготовить ${key}`,
): PreparationItem {
  return PreparationItem.create({
    id: EntityId.create(`v2b-item-${key}`),
    planId: PLAN_ID,
    key,
    area,
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
