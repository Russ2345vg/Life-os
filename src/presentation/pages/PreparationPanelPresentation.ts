import {
  PREPARATION_CATEGORY,
  PREPARATION_ITEM_STATUS,
  type PreparationCategory,
  type PreparationItem,
} from '../../domain';

export type PreparationPanelAction = Readonly<{
  intent: 'continue' | 'beginEdit' | 'finishEdit';
  tone: 'primary' | 'secondary';
  label: 'Перейти к завершению →' | 'Изменить подготовку' | 'Завершить редактирование';
}>;

export type PreparationSummaryTone = 'ready' | 'neutral';

export interface PreparationSummaryItem {
  readonly id: 'prepared' | PreparationCategory | 'first-start';
  readonly label: string;
  readonly value: string;
  readonly tone: PreparationSummaryTone;
}

export interface PreparationPanelPresentation {
  readonly processed: number;
  readonly requiredPending: number;
  readonly fullyReady: boolean;
  readonly progressValue: number;
  readonly summary: readonly PreparationSummaryItem[];
  readonly action: PreparationPanelAction | null;
}

export function preparationHeading(completedReview: boolean): Readonly<{
  kicker: 'Подготовка' | 'Сохранённая подготовка';
  title:
    'Уберите всё, что может затруднить первый старт утром.' | 'Всё необходимое было подготовлено.';
}> {
  return completedReview
    ? { kicker: 'Сохранённая подготовка', title: 'Всё необходимое было подготовлено.' }
    : {
        kicker: 'Подготовка',
        title: 'Уберите всё, что может затруднить первый старт утром.',
      };
}

export function buildPreparationPanelPresentation(
  items: readonly PreparationItem[],
  firstActionDefined: boolean,
  completedReview: boolean,
  completedReviewEditing: boolean,
): PreparationPanelPresentation {
  const processed = items.filter((item) => item.status !== PREPARATION_ITEM_STATUS.pending).length;
  const requiredPending = items.filter(
    (item) => item.required && item.status === PREPARATION_ITEM_STATUS.pending,
  ).length;
  const fullyReady = processed === items.length;
  const action: PreparationPanelAction | null = !completedReview
    ? { intent: 'continue', tone: 'primary', label: 'Перейти к завершению →' }
    : items.length === 0
      ? null
      : completedReviewEditing
        ? {
            intent: 'finishEdit',
            tone: 'secondary',
            label: 'Завершить редактирование',
          }
        : { intent: 'beginEdit', tone: 'secondary', label: 'Изменить подготовку' };
  return {
    processed,
    requiredPending,
    fullyReady,
    progressValue: items.length === 0 ? 100 : Math.round((processed / items.length) * 100),
    summary: buildPreparationSummary(items, firstActionDefined, completedReview),
    action,
  };
}

export function buildPreparationSummary(
  items: readonly PreparationItem[],
  firstActionDefined: boolean,
  completedReview: boolean,
): readonly PreparationSummaryItem[] {
  const processed = items.filter((item) => item.status !== PREPARATION_ITEM_STATUS.pending).length;
  const firstStartValue = firstActionDefined
    ? completedReview
      ? 'Был определён'
      : 'Определён'
    : 'Не определён';

  const categories = [
    categorySummary(items, PREPARATION_CATEGORY.digital, 'Цифровая среда'),
    categorySummary(items, PREPARATION_CATEGORY.physical, 'Физически'),
    categorySummary(items, PREPARATION_CATEGORY.cognitive, 'Дополнительно'),
  ].flatMap((item) => (item === null ? [] : [item]));

  return Object.freeze([
    {
      id: 'prepared',
      label: completedReview ? 'Было подготовлено' : 'Подготовлено',
      value: `${processed} из ${items.length}`,
      tone: processed === items.length ? 'ready' : 'neutral',
    },
    ...categories,
    {
      id: 'first-start',
      label: 'Первый старт',
      value: firstStartValue,
      tone: firstActionDefined ? 'ready' : 'neutral',
    },
  ]);
}

function categorySummary(
  items: readonly PreparationItem[],
  category: PreparationCategory,
  label: string,
): PreparationSummaryItem | null {
  const categoryItems = items.filter((item) => item.category === category);
  if (categoryItems.length === 0) return null;
  const processed = categoryItems.filter(
    (item) => item.status !== PREPARATION_ITEM_STATUS.pending,
  ).length;
  return {
    id: category,
    label,
    value: `${processed} из ${categoryItems.length}`,
    tone: processed === categoryItems.length ? 'ready' : 'neutral',
  };
}
