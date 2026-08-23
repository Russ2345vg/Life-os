import type { EveningReviewSnapshot, TomorrowPlanSnapshot } from '../../application';
import { EVENING_CYCLE_MODE } from '../../domain';

export interface EveningTomorrowPreview {
  readonly primaryDecisionTitle: string | null;
  readonly firstStepTitle: string | null;
}

export interface EveningShutdownSceneModel {
  readonly tone: 'normal' | 'quick' | 'emergency';
  readonly title: string;
  readonly lead: string;
  readonly facts: readonly string[];
  readonly note: string | null;
  readonly tomorrow: EveningTomorrowPreview;
}

export interface EveningRecoverySceneModel {
  readonly dateLabel: string;
  readonly lead: string;
  readonly tomorrow: EveningTomorrowPreview;
}

export const EMPTY_EVENING_TOMORROW_PREVIEW: EveningTomorrowPreview = Object.freeze({
  primaryDecisionTitle: null,
  firstStepTitle: null,
});

export function eveningTomorrowPreviewFromPlan(
  snapshot: TomorrowPlanSnapshot | null,
): EveningTomorrowPreview {
  if (snapshot === null) return EMPTY_EVENING_TOMORROW_PREVIEW;

  return Object.freeze({
    primaryDecisionTitle: snapshot.primaryDecision?.title.toString() ?? null,
    firstStepTitle: snapshot.firstAction?.title.toString() ?? null,
  });
}

export function buildEveningShutdownSceneModel(
  snapshot: EveningReviewSnapshot,
  tomorrow: EveningTomorrowPreview,
  tomorrowPreviewLoaded = true,
): EveningShutdownSceneModel {
  const mode = snapshot.cycle.mode;
  const tomorrowKnown = hasTomorrowPreview(tomorrow);

  if (mode === EVENING_CYCLE_MODE.emergency) {
    return Object.freeze({
      tone: 'emergency',
      title: 'Позднее завершение',
      lead: 'Всё необходимое сохранено. Остальное можно уточнить утром.',
      facts: Object.freeze([]),
      note: null,
      tomorrow,
    });
  }

  if (mode === EVENING_CYCLE_MODE.quick) {
    return Object.freeze({
      tone: 'quick',
      title: 'Завершение дня',
      lead: 'Сегодня можно закрыть.',
      facts: Object.freeze(['Критическое разобрано', 'Обязательная подготовка выполнена']),
      note: null,
      tomorrow: Object.freeze({
        primaryDecisionTitle: tomorrow.primaryDecisionTitle,
        firstStepTitle: null,
      }),
    });
  }

  return Object.freeze({
    tone: 'normal',
    title: 'Завершение дня',
    lead: 'Сегодня можно закрыть.',
    facts: Object.freeze([
      'Незавершённое разобрано',
      'Итоги сохранены',
      'Завтра определено',
      'Подготовка выполнена',
    ]),
    note:
      tomorrowKnown || !tomorrowPreviewLoaded
        ? null
        : 'Не удалось загрузить детали завтрашнего плана. День по-прежнему можно завершить.',
    tomorrow,
  });
}

export function buildEveningRecoverySceneModel(
  snapshot: EveningReviewSnapshot,
  tomorrow: EveningTomorrowPreview,
): EveningRecoverySceneModel {
  return Object.freeze({
    dateLabel: formatEveningDate(snapshot.cycle.dateKey.toString()),
    lead: 'Сегодня больше ничего не требует решения. Завтра подготовлено.',
    tomorrow,
  });
}

export function formatEveningDate(dateKey: string): string {
  const [yearText, monthText, dayText] = dateKey.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  const weekday = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .replace(' г.', '');
  return `${capitalize(weekday)} · ${dateLabel}`;
}

function hasTomorrowPreview(preview: EveningTomorrowPreview): boolean {
  return preview.primaryDecisionTitle !== null || preview.firstStepTitle !== null;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
