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

    const empty = buildPreparationPanelPresentation([], true, true, false);
    expect(empty).toMatchObject({
      processed: 0,
      requiredPending: 0,
      fullyReady: true,
      progressValue: 100,
      action: null,
    });
    expect(empty.summary.map((item) => item.id)).toEqual(['prepared', 'first-start']);
    const pending = buildPreparationPanelPresentation([first, second], true, true, false);
    expect(pending).toMatchObject({
      processed: 0,
      requiredPending: 1,
      fullyReady: false,
      progressValue: 0,
      action: { intent: 'beginEdit', tone: 'secondary', label: 'Изменить подготовку' },
    });
    expect(pending.summary.map((item) => item.id)).toEqual([
      'prepared',
      PREPARATION_CATEGORY.digital,
      PREPARATION_CATEGORY.physical,
      'first-start',
    ]);
    expect(
      buildPreparationPanelPresentation([first.complete(NOW), second], true, true, false),
    ).toMatchObject({
      processed: 1,
      requiredPending: 0,
      fullyReady: false,
      progressValue: 50,
      action: { intent: 'beginEdit', tone: 'secondary', label: 'Изменить подготовку' },
    });
    expect(
      buildPreparationPanelPresentation(
        [first.complete(NOW), second.skip(NOW, 'Не требуется')],
        true,
        true,
        false,
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

    expect(buildPreparationPanelPresentation([item], true, true, false).action).toEqual({
      intent: 'beginEdit',
      tone: 'secondary',
      label: 'Изменить подготовку',
    });
    expect(buildPreparationPanelPresentation([item], true, true, true).action).toEqual({
      intent: 'finishEdit',
      tone: 'secondary',
      label: 'Завершить редактирование',
    });
    expect(presentationSource).not.toContain('Сохранить подготовку');
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

  it('сохраняет компактную сводку, первый старт и адаптивные сетки сцены', () => {
    expect(presentationSource).toContain("'Было подготовлено' : 'Подготовлено'");
    expect(presentationSource).toContain("'Цифровая среда'");
    expect(presentationSource).toContain("'Физически'");
    expect(presentationSource).toContain("'Дополнительно'");
    expect(preparationSource).toContain('Первый старт завтра');
    expect(preparationSource).toContain('PreparationSummaryStrip');
    expect(preparationSource).not.toContain('className="preparation-metrics"');
    expect(v2bCss).toMatch(
      /\.preparation-summary-strip\s*{[^}]*grid-template-columns:\s*minmax\(10\.5rem, 0\.65fr\) minmax\(0, 1\.35fr\)/,
    );
    expect(v2bCss).toMatch(
      /\.evening-command-center-page \.preparation-sections-3\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(v2bCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-command-center-page \.preparation-sections,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});

function preparationItem(
  key: string,
  required: boolean,
  category: PreparationCategory,
): PreparationItem {
  return PreparationItem.create({
    id: EntityId.create(`item-${key}`),
    planId: EntityId.create('preparation-plan'),
    key,
    category,
    title: `Подготовить ${key}`,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required,
  });
}
