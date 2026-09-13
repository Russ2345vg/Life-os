import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import {
  DayDate,
  EntityId,
  PREPARATION_CATEGORY,
  EVENING_CYCLE_MODE,
  PREPARATION_PLAN_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  PreparationPlan,
  type PreparationCategory,
} from '../../domain';
import { PREPARATION_AREA, type PreparationArea } from '../../domain/preparation';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import type { PreparationSnapshot } from '../../application';
import {
  PreparationEmptyState,
  PreparationOperationAlert,
  PreparationSceneView,
  PreparationSection,
} from './PreparationPanel';
import {
  buildPreparationPanelPresentation,
  preparationHeading,
} from './PreparationPanelPresentation';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const v2bCss = globalCss.slice(
  globalCss.lastIndexOf('/* E11.3G-B: PreparationScene visual fidelity V2B */'),
);
const presentationSource = readFileSync(
  new URL('./PreparationPanelPresentation.ts', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(new URL('./PreparationPanel.tsx', import.meta.url), 'utf8');

describe('PreparationPanel completed history', () => {
  it('показывает компактную фазу 4A с двумя равными группами и реальным контекстом завтра', () => {
    const sleep = [
      preparationItem(
        'sleep-core-one',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
      ),
      preparationItem(
        'sleep-core-two',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
      ),
    ];
    const tomorrow = [
      preparationItem(
        'tomorrow-core-one',
        false,
        PREPARATION_CATEGORY.digital,
        PREPARATION_AREA.tomorrowStart,
      ),
      preparationItem(
        'tomorrow-core-two',
        false,
        PREPARATION_CATEGORY.digital,
        PREPARATION_AREA.tomorrowStart,
      ),
    ];
    const firstAction = createReadyLifeAction('открыть-цель-lifeos', DayDate.create('2026-08-22'));
    const markup = renderToStaticMarkup(
      PreparationSceneView({
        snapshot: { ...preparationSnapshotForCore([...sleep, ...tomorrow]), firstAction },
        mode: EVENING_CYCLE_MODE.normal,
        completedReview: false,
        completedReviewEditing: false,
        busyItemId: null,
        isContinuing: false,
        onProcess: async () => undefined,
        onContinue: async () => undefined,
        onReviewEditingChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Подготовьте среду');
    expect(markup).toContain('Несколько простых действий — и утро начнётся без лишней суеты.');
    expect(renderedText(markup)).toContain('Выбрано 4 из 3–6');
    expect(markup).toContain('Для спокойного вечера');
    expect(markup).toContain('Для завтра');
    expect(renderedText(markup)).toContain('Завтра: Действие открыть-цель-lifeos');
    expect(markup).toContain('class="preparation-tomorrow-context"');
    expect(markup).not.toContain('class="preparation-first-start"');
    expect(markup).not.toContain('Первый старт завтра');
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(4);
    expect(markup).toMatch(/<button[^>]*>Продолжить →<\/button>/);
    expect(markup).toContain('preparation-core-actions');
    expect(markup).not.toContain('aria-label="Краткая сводка готовности"');
    expect([...sleep, ...tomorrow].every((item) => item.status === 'PENDING')).toBe(true);
  });

  it('показывает фактическое первое действие в baseline item настройки', () => {
    const firstActionItem = preparationItem(
      'ENVIRONMENT:TOMORROW:FIRST_ACTION',
      false,
      PREPARATION_CATEGORY.cognitive,
      PREPARATION_AREA.tomorrowStart,
    );
    const supportingItems = [
      preparationItem(
        'sleep-one',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
      ),
      preparationItem(
        'sleep-two',
        false,
        PREPARATION_CATEGORY.digital,
        PREPARATION_AREA.sleepEnvironment,
      ),
      preparationItem(
        'tomorrow-one',
        false,
        PREPARATION_CATEGORY.digital,
        PREPARATION_AREA.tomorrowStart,
      ),
    ];
    const snapshot = preparationSnapshotForCore([firstActionItem, ...supportingItems]);
    const markup = renderToStaticMarkup(
      PreparationSceneView({
        snapshot: {
          ...snapshot,
          firstAction: createReadyLifeAction('открыть-цель-lifeos', DayDate.create('2026-08-22')),
        },
        mode: EVENING_CYCLE_MODE.normal,
        completedReview: false,
        completedReviewEditing: false,
        busyItemId: null,
        isContinuing: false,
        onProcess: async () => undefined,
        onContinue: async () => undefined,
        onReviewEditingChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Подготовить всё для: Действие открыть-цель-lifeos');
    expect(markup).not.toContain('Подготовить ENVIRONMENT:TOMORROW:FIRST_ACTION');
  });

  it('показывает рекомендуемую длительность пункта ритуала', () => {
    const items = [
      preparationItem(
        'sleep-duration',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
        'Приглушить освещение',
        17,
      ),
      preparationItem('sleep-two', false, PREPARATION_CATEGORY.physical),
      preparationItem('tomorrow-one', false, PREPARATION_CATEGORY.digital),
      preparationItem('tomorrow-two', false, PREPARATION_CATEGORY.cognitive),
    ];
    const markup = renderToStaticMarkup(
      PreparationSceneView({
        snapshot: preparationSnapshotForCore(
          items,
          items.map((item) => item.key),
        ),
        mode: EVENING_CYCLE_MODE.normal,
        completedReview: false,
        completedReviewEditing: false,
        busyItemId: null,
        isContinuing: false,
        onProcess: async () => undefined,
        onContinue: async () => undefined,
        onReviewEditingChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Рекомендуемо: 17 мин');
  });

  it('уточняет legacy baseline copy без перезаписи сохранённого плана', () => {
    const ventilation = preparationItem(
      'ENVIRONMENT:SLEEP:VENTILATE_ROOM',
      false,
      PREPARATION_CATEGORY.physical,
      PREPARATION_AREA.sleepEnvironment,
      'Проверить комнату',
    );
    const supportingItems = ['sleep-two', 'tomorrow-one', 'tomorrow-two'].map((key, index) =>
      preparationItem(
        key,
        false,
        PREPARATION_CATEGORY.physical,
        index === 0 ? PREPARATION_AREA.sleepEnvironment : PREPARATION_AREA.tomorrowStart,
      ),
    );
    const markup = renderToStaticMarkup(
      PreparationSceneView({
        snapshot: preparationSnapshotForCore([ventilation, ...supportingItems]),
        mode: EVENING_CYCLE_MODE.normal,
        completedReview: false,
        completedReviewEditing: false,
        busyItemId: null,
        isContinuing: false,
        onProcess: async () => undefined,
        onContinue: async () => undefined,
        onReviewEditingChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Проветрить комнату');
    expect(markup).not.toContain('Проверить комнату');
    expect(ventilation.title).toBe('Проверить комнату');
  });

  it('блокирует подтверждение ядра вне диапазона от трёх до шести', () => {
    const items = [
      preparationItem(
        'one',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
      ),
      preparationItem(
        'two',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
      ),
      preparationItem('three', false, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
      preparationItem('four', false, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
    ];
    const snapshot = preparationSnapshotForCore(items);
    const renderWithKeys = (selectedKeys: readonly string[]) =>
      renderToStaticMarkup(
        PreparationSceneView({
          snapshot,
          mode: EVENING_CYCLE_MODE.normal,
          completedReview: false,
          completedReviewEditing: false,
          busyItemId: null,
          isContinuing: false,
          coreDraft: {
            planId: snapshot.plan.id.toString(),
            savedCoreSignature: '',
            selectedKeys,
          },
          onProcess: async () => undefined,
          onContinue: async () => undefined,
          onReviewEditingChange: vi.fn(),
        }),
      );

    const two = renderWithKeys(items.slice(0, 2).map((item) => item.key));
    const seven = renderWithKeys([
      ...items.map((item) => item.key),
      'additional-one',
      'additional-two',
      'additional-three',
    ]);

    expect(renderedText(two)).toContain('Выбрано 2 из 3–6');
    expect(two).toMatch(/<button[^>]*disabled=""[^>]*>Продолжить →<\/button>/);
    expect(renderedText(seven)).toContain('Выбрано 7 из 3–6');
    expect(seven).toMatch(/<button[^>]*disabled=""[^>]*>Продолжить →<\/button>/);
  });

  it('показывает первичную настройку ядра в emergency до первого подтверждения', () => {
    const items = [
      preparationItem(
        'sleep-one',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
      ),
      preparationItem(
        'sleep-two',
        false,
        PREPARATION_CATEGORY.physical,
        PREPARATION_AREA.sleepEnvironment,
      ),
      preparationItem(
        'tomorrow-one',
        false,
        PREPARATION_CATEGORY.digital,
        PREPARATION_AREA.tomorrowStart,
      ),
      preparationItem(
        'tomorrow-two',
        false,
        PREPARATION_CATEGORY.digital,
        PREPARATION_AREA.tomorrowStart,
      ),
    ];
    const markup = renderToStaticMarkup(
      PreparationSceneView({
        snapshot: preparationSnapshotForCore(items),
        mode: EVENING_CYCLE_MODE.emergency,
        completedReview: false,
        completedReviewEditing: false,
        busyItemId: null,
        isContinuing: false,
        onProcess: async () => undefined,
        onContinue: async () => undefined,
        onReviewEditingChange: vi.fn(),
      }),
    );

    expect(renderedText(markup)).toContain('Выбрано 4 из 3–6');
    expect(markup).toContain('Продолжить →');
    expect(markup).not.toContain('Настроить ядро</button>');
  });

  it('показывает итоговый заголовок и компактное пустое состояние без CTA', () => {
    const markup = renderToStaticMarkup(
      PreparationEmptyState({
        firstActionDefined: true,
        completedReview: true,
      }),
    );

    expect(preparationHeading(true)).toEqual({
      kicker: 'Сохранённая подготовка',
      title: 'Всё необходимое было подготовлено.',
    });
    expect(markup).toContain('Всё было готово');
    expect(markup).toContain('Дополнительных пунктов подготовки не требовалось.');
    expect(markup).not.toContain('Первый шаг был определён.');
    expect(markup).toContain('is-history-empty');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('Сохранить подготовку');
    expect(v2bCss).toMatch(/\.preparation-success-state[\s\S]*?min-height:\s*0/);
  });

  it('оставляет пустое активное состояние действием текущего этапа', () => {
    const markup = renderToStaticMarkup(
      PreparationEmptyState({
        firstActionDefined: false,
        completedReview: false,
      }),
    );

    expect(preparationHeading(false).title).toBe(
      'Уберите всё, что может затруднить первый старт утром.',
    );
    expect(markup).toContain('Для завтрашнего старта дополнительная подготовка не нужна.');
    expect(markup).toContain('Первый шаг ещё не определён.');
    expect(markup).not.toContain('<button');
  });

  it('считает пустой, заполненный, частичный и полностью выполненный планы', () => {
    const first = preparationItem('first', true, PREPARATION_CATEGORY.digital);
    const second = preparationItem('second', false, PREPARATION_CATEGORY.physical);

    const empty = buildPreparationPanelPresentation([], true, true, false, true);
    expect(empty).toMatchObject({
      processed: 0,
      requiredPending: 0,
      fullyReady: true,
      progressValue: 100,
      action: null,
    });
    expect(empty.summary.map((item) => item.id)).toEqual(['prepared', 'first-start']);
    const pending = buildPreparationPanelPresentation([first, second], true, true, false, true);
    expect(pending).toMatchObject({
      processed: 0,
      requiredPending: 1,
      fullyReady: false,
      progressValue: 0,
      action: { intent: 'beginEdit', tone: 'secondary', label: 'Изменить подготовку' },
    });
    expect(pending.summary.map((item) => item.id)).toEqual([
      'prepared',
      PREPARATION_AREA.tomorrowStart,
      'first-start',
    ]);
    expect(buildPreparationPanelPresentation([first], true, false, false, true).action).toEqual({
      intent: 'continue',
      tone: 'primary',
      label: 'Перейти к расслаблению →',
    });
    expect(
      buildPreparationPanelPresentation([first.complete(NOW), second], true, true, false, true),
    ).toMatchObject({
      processed: 1,
      requiredPending: 0,
      fullyReady: true,
      progressValue: 50,
      action: { intent: 'beginEdit', tone: 'secondary', label: 'Изменить подготовку' },
    });
    expect(
      buildPreparationPanelPresentation(
        [first.complete(NOW), second.skip(NOW, 'Не требуется')],
        true,
        true,
        false,
        true,
      ),
    ).toMatchObject({
      processed: 2,
      requiredPending: 0,
      fullyReady: true,
      progressValue: 100,
      action: { intent: 'beginEdit', tone: 'secondary', label: 'Изменить подготовку' },
    });
  });

  it('оставляет history-редактирование вторичным и не показывает кнопку сохранения', () => {
    const item = preparationItem('editable', true, PREPARATION_CATEGORY.digital).complete(NOW);

    expect(buildPreparationPanelPresentation([item], true, true, false, true).action).toEqual({
      intent: 'beginEdit',
      tone: 'secondary',
      label: 'Изменить подготовку',
    });
    expect(buildPreparationPanelPresentation([item], true, true, true, true).action).toEqual({
      intent: 'finishEdit',
      tone: 'secondary',
      label: 'Завершить редактирование',
    });
    expect(presentationSource).not.toContain('Сохранить подготовку');
  });

  it('блокирует readiness пустого и частичного плана до явного подтверждения ядра', () => {
    const required = preparationItem(
      'required',
      true,
      PREPARATION_CATEGORY.physical,
      PREPARATION_AREA.sleepEnvironment,
    );

    expect(buildPreparationPanelPresentation([], true, false, false, false)).toMatchObject({
      processed: 0,
      requiredPending: 0,
      fullyReady: false,
      progressValue: 100,
    });
    expect(buildPreparationPanelPresentation([required], true, false, false, true)).toMatchObject({
      processed: 0,
      requiredPending: 1,
      fullyReady: false,
      progressValue: 0,
    });
  });

  it('считает обработанный required и pending optional готовыми к продолжению', () => {
    const required = preparationItem(
      'required',
      true,
      PREPARATION_CATEGORY.physical,
      PREPARATION_AREA.sleepEnvironment,
    ).skip(NOW, 'Сегодня не требуется');
    const optional = preparationItem(
      'optional',
      false,
      PREPARATION_CATEGORY.digital,
      PREPARATION_AREA.tomorrowStart,
    );

    expect(
      buildPreparationPanelPresentation([required, optional], true, false, false, true),
    ).toMatchObject({
      processed: 1,
      requiredPending: 0,
      fullyReady: true,
      progressValue: 50,
    });
  });

  it('считает полностью обработанный план готовым', () => {
    const first = preparationItem(
      'first',
      true,
      PREPARATION_CATEGORY.physical,
      PREPARATION_AREA.sleepEnvironment,
    ).complete(NOW);
    const second = preparationItem(
      'second',
      false,
      PREPARATION_CATEGORY.digital,
      PREPARATION_AREA.tomorrowStart,
    ).skip(NOW);

    expect(
      buildPreparationPanelPresentation([first, second], true, false, false, true),
    ).toMatchObject({
      processed: 2,
      requiredPending: 0,
      fullyReady: true,
      progressValue: 100,
    });
  });

  it('сохраняет legacy сводку только для сохранённой среды завтра', () => {
    const legacy = preparationItem(
      'legacy',
      true,
      PREPARATION_CATEGORY.digital,
      PREPARATION_AREA.tomorrowStart,
    );

    expect(buildPreparationPanelPresentation([legacy], false, true, false, true).summary).toEqual([
      {
        id: 'prepared',
        label: 'Было подготовлено',
        value: '0 из 1',
        tone: 'neutral',
      },
      {
        id: PREPARATION_AREA.tomorrowStart,
        label: 'Среда завтра',
        value: '0 из 1',
        tone: 'neutral',
      },
      {
        id: 'first-start',
        label: 'Первый старт',
        value: 'Не определён',
        tone: 'neutral',
      },
    ]);
  });

  it('делает пункты read-only до явного входа в редактирование', () => {
    const item = preparationItem('readonly', true, PREPARATION_CATEGORY.digital).complete(NOW);
    const readOnlyMarkup = renderToStaticMarkup(
      PreparationSection({
        area: PREPARATION_AREA.tomorrowStart,
        items: [item],
        busyItemId: null,
        editable: false,
        reviewEditing: false,
        completedReview: true,
        onProcess: vi.fn(),
      }),
    );
    const editMarkup = renderToStaticMarkup(
      PreparationSection({
        area: PREPARATION_AREA.tomorrowStart,
        items: [item],
        busyItemId: null,
        editable: true,
        reviewEditing: true,
        completedReview: true,
        onProcess: vi.fn(),
      }),
    );
    const activeCompletedMarkup = renderToStaticMarkup(
      PreparationSection({
        area: PREPARATION_AREA.tomorrowStart,
        items: [item],
        busyItemId: null,
        editable: true,
        reviewEditing: false,
        completedReview: false,
        onProcess: vi.fn(),
      }),
    );

    expect(readOnlyMarkup).toContain('preparation-item-outcome');
    expect(readOnlyMarkup).not.toContain('<button');
    expect(editMarkup).toContain('preparation-item-outcome');
    expect(editMarkup).not.toContain('<button');
    expect(activeCompletedMarkup).toContain('preparation-item-outcome');
    expect(activeCompletedMarkup).not.toContain('<button');
  });

  it('оставляет checklist видимым и даёт operation-specific retry после ошибки сохранения', () => {
    const markup = renderToStaticMarkup(
      PreparationOperationAlert({
        message: 'Не удалось сохранить пункт подготовки.',
        retryLabel: 'Повторить сохранение пункта',
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось сохранить пункт подготовки.');
    expect(markup).toContain('Повторить сохранение пункта');
    const processItemSource = panelSource.slice(
      panelSource.indexOf('async function processItem'),
      panelSource.indexOf('async function configureRequiredCore'),
    );
    const continueSource = panelSource.slice(
      panelSource.indexOf('async function continueToRelaxation'),
      panelSource.indexOf('async function retryOperation'),
    );
    expect(processItemSource).not.toContain('setLoadState');
    expect(continueSource).not.toContain('setLoadState');
  });

  it('назначает focus target первой реально видимой области, включая tomorrow-only QUICK', () => {
    const tomorrowItems = ['tomorrow-one', 'tomorrow-two', 'tomorrow-three'].map((key) =>
      preparationItem(key, true, PREPARATION_CATEGORY.digital, PREPARATION_AREA.tomorrowStart),
    );
    const snapshot = preparationSnapshotForCore(
      tomorrowItems,
      tomorrowItems.map((item) => item.key),
    );
    const markup = renderToStaticMarkup(
      PreparationSceneView({
        snapshot,
        mode: EVENING_CYCLE_MODE.quick,
        completedReview: false,
        completedReviewEditing: false,
        busyItemId: null,
        isContinuing: false,
        checklistHeadingRef: { current: null },
        onProcess: async () => undefined,
        onContinue: async () => undefined,
        onReviewEditingChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Среда для завтра');
    expect(markup).toContain('data-focus-target="true"');
    expect(markup).not.toContain('Среда для сна');
  });

  it('строит area-primary сводку с точными русскими labels', () => {
    expect(presentationSource).toContain("'Было подготовлено' : 'Подготовлено'");
    expect(presentationSource).toContain("'Среда сна'");
    expect(presentationSource).toContain("'Среда завтра'");
  });
});

function preparationItem(
  key: string,
  required: boolean,
  category: PreparationCategory,
  area: PreparationArea = PREPARATION_AREA.tomorrowStart,
  title = `Подготовить ${key}`,
  recommendedDurationMinutes: number | null = null,
): PreparationItem {
  return PreparationItem.create({
    id: EntityId.create(`item-${key}`),
    planId: EntityId.create('preparation-plan'),
    key,
    area,
    category,
    title,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required,
    recommendedDurationMinutes,
  });
}

function preparationSnapshotForCore(
  items: readonly PreparationItem[],
  requiredCoreKeys: readonly string[] | null = null,
): PreparationSnapshot {
  return {
    plan: PreparationPlan.rehydrate({
      id: EntityId.create('preparation-plan'),
      cycleId: EntityId.create('core-cycle'),
      tomorrowPlanId: EntityId.create('core-tomorrow-plan'),
      targetDayId: EntityId.create('core-target-day'),
      items,
      requiredCoreKeys,
      sourceVersion: 1,
      generationSignature: 'core-fixture',
      status: PREPARATION_PLAN_STATUS.inProgress,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
      version: 1,
    }),
    recommendedCoreKeys: items.map((item) => item.key),
    firstAction: null,
    primaryDecision: null,
    project: null,
  };
}

function renderedText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
