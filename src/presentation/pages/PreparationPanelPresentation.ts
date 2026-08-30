import {
  PREPARATION_ITEM_STATUS,
  type PreparationItem,
} from '../../domain';
import { PREPARATION_AREA, type PreparationArea } from '../../domain/preparation';

export type PreparationPanelAction = Readonly<{
  intent: 'continue' | 'beginEdit' | 'finishEdit';
  tone: 'primary' | 'secondary';
  label: 'Перейти к завершению →' | 'Изменить подготовку' | 'Завершить редактирование';
}>;

export type PreparationSummaryTone = 'ready' | 'neutral';

export interface PreparationSummaryItem {
  readonly id: 'prepared' | PreparationArea | 'first-start';
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
  coreConfigured = false,
): PreparationPanelPresentation {
  const processed = items.filter((item) => item.status !== PREPARATION_ITEM_STATUS.pending).length;
  const requiredPending = items.filter(
    (item) => item.required && item.status === PREPARATION_ITEM_STATUS.pending,
  ).length;
  const fullyReady = coreConfigured && requiredPending === 0;
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

  const areas = [
    areaSummary(items, PREPARATION_AREA.sleepEnvironment, 'Среда сна'),
    areaSummary(items, PREPARATION_AREA.tomorrowStart, 'Среда завтра'),
  ].flatMap((item) => (item === null ? [] : [item]));

  return Object.freeze([
    {
      id: 'prepared',
      label: completedReview ? 'Было подготовлено' : 'Подготовлено',
      value: `${processed} из ${items.length}`,
      tone: processed === items.length ? 'ready' : 'neutral',
    },
    ...areas,
    {
      id: 'first-start',
      label: 'Первый старт',
      value: firstStartValue,
      tone: firstActionDefined ? 'ready' : 'neutral',
    },
  ]);
}

function areaSummary(
  items: readonly PreparationItem[],
  area: PreparationArea,
  label: string,
): PreparationSummaryItem | null {
  const areaItems = items.filter((item) => item.area === area);
  if (areaItems.length === 0) return null;
  const processed = areaItems.filter(
    (item) => item.status !== PREPARATION_ITEM_STATUS.pending,
  ).length;
  return {
    id: area,
    label,
    value: `${processed} из ${areaItems.length}`,
    tone: processed === areaItems.length ? 'ready' : 'neutral',
  };
}
