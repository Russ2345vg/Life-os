import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import type { PreparationSnapshot } from '../../application';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  PREPARATION_CATEGORY,
  PREPARATION_PLAN_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  PreparationPlan,
  type EveningCycleMode,
  type PreparationCategory,
} from '../../domain';
import { PREPARATION_AREA, type PreparationArea } from '../../domain/preparation';
import { PreparationSceneState, PreparationSceneView } from './PreparationPanel';

const DATE = DayDate.create('2026-08-22');
const NOW = new Date('2026-08-21T12:00:00.000Z');
const PLAN_ID = EntityId.create('v2b-preparation-plan');
const environmentCss = readFileSync(new URL('../styles/evening-environment.css', import.meta.url), 'utf8');
const preparationSource = readFileSync(new URL('./PreparationPanel.tsx', import.meta.url), 'utf8');

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

  it('фиксирует Environment CSS: grid, mobile, touch, focus и reduced motion', () => {
    expect(environmentCss).toContain('.preparation-environment-areas');
    expect(environmentCss).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(environmentCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(environmentCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?min-height:\s*44px/);
    expect(environmentCss).toContain(':focus-visible');
    expect(environmentCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(environmentCss).not.toMatch(/overflow-x:\s*(?:auto|scroll)/);
    expect(preparationSource).toContain("import '../styles/evening-environment.css'");
  });
});

function renderScene(
  snapshot: PreparationSnapshot,
  options: Readonly<{ mode?: EveningCycleMode }> = {},
): string {
  return renderToStaticMarkup(
    PreparationSceneView({
      snapshot,
      mode: options.mode ?? EVENING_CYCLE_MODE.normal,
      completedReview: false,
      completedReviewEditing: false,
      busyItemId: null,
      isContinuing: false,
      onProcess: async () => undefined,
      onContinue: async () => undefined,
      onReviewEditingChange: vi.fn(),
    }),
  );
}

function preparationSnapshot(items: readonly PreparationItem[]): PreparationSnapshot {
  const requiredCoreKeys = items.filter((item) => item.required).map((item) => item.key);
  return {
    plan: PreparationPlan.rehydrate({
      id: PLAN_ID,
      cycleId: EntityId.create('v2b-cycle'),
      tomorrowPlanId: EntityId.create('v2b-tomorrow-plan'),
      targetDayId: EntityId.create('v2b-target-day'),
      items,
      requiredCoreKeys,
      sourceVersion: 1,
      generationSignature: 'v2b-fixture',
      status: PREPARATION_PLAN_STATUS.inProgress,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      version: 1,
    }),
    recommendedCoreKeys: requiredCoreKeys,
    firstAction: null,
    primaryDecision: null,
    project: null,
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
): PreparationItem {
  return PreparationItem.create({
    id: EntityId.create(`v2b-item-${key}`),
    planId: PLAN_ID,
    key,
    area,
    category,
    title: `Подготовить ${key}`,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required,
  });
}
