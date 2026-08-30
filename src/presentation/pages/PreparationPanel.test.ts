import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import {
  EntityId,
  PREPARATION_CATEGORY,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  type PreparationCategory,
} from '../../domain';
import { PREPARATION_AREA, type PreparationArea } from '../../domain/preparation';
import { PreparationEmptyState, PreparationSection } from './PreparationPanel';
import {
  buildPreparationPanelPresentation,
  preparationHeading,
} from './PreparationPanelPresentation';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const v2bCss = globalCss.slice(
  globalCss.lastIndexOf('/* E11.3G-B: PreparationScene visual fidelity V2B */'),
);
const preparationSource = readFileSync(new URL('./PreparationPanel.tsx', import.meta.url), 'utf8');
const presentationSource = readFileSync(
  new URL('./PreparationPanelPresentation.ts', import.meta.url),
  'utf8',
);

describe('PreparationPanel completed history', () => {
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
    expect(
      buildPreparationPanelPresentation([required], true, false, false, true),
    ).toMatchObject({
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

    expect(
      buildPreparationPanelPresentation([legacy], false, true, false, true).summary,
    ).toEqual([
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
        category: PREPARATION_CATEGORY.digital,
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
        category: PREPARATION_CATEGORY.digital,
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
        category: PREPARATION_CATEGORY.digital,
        items: [item],
        busyItemId: null,
        editable: true,
        reviewEditing: false,
        completedReview: false,
        onProcess: vi.fn(),
      }),
    );

    expect(readOnlyMarkup).toContain('disabled=""');
    expect(readOnlyMarkup).not.toContain('preparation-item-menu');
    expect(editMarkup).toContain('preparation-item-menu');
    expect(editMarkup).toContain('Пропустить');
    expect(activeCompletedMarkup).not.toContain('preparation-item-menu');
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
): PreparationItem {
  return PreparationItem.create({
    id: EntityId.create(`item-${key}`),
    planId: EntityId.create('preparation-plan'),
    key,
    area,
    category,
    title: `Подготовить ${key}`,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required,
  });
}
