import type { EveningReviewSnapshot, ReflectionSession } from '../../application';
import {
  DECISION_STATUS,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  type EveningCycleMode,
  type EveningCycleState,
} from '../../domain';
import type { EveningVisualIconName } from '../components/EveningVisualIcon';
import { isUnfinishedAction } from './EveningReviewPanelState';

export const EVENING_JOURNEY = [
  { id: 'today', label: 'Сегодня', title: 'Закрываем сегодняшний день' },
  { id: 'reflection', label: 'Осмысление', title: 'Осмысление дня' },
  { id: 'tomorrow', label: 'Завтра', title: 'ЗАВТРА' },
  { id: 'preparation', label: 'Среда', title: 'СРЕДА' },
  { id: 'relaxation', label: 'Расслабление', title: 'Расслабление' },
  { id: 'sleep', label: 'Сон', title: 'Проверка перед сном' },
  { id: 'shutdown', label: 'Завершение', title: 'Завершение дня' },
] as const;

export type EveningJourneyId = (typeof EVENING_JOURNEY)[number]['id'];
export type SelectedEveningView = EveningJourneyId | 'recovery';

export const EVENING_STEPS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'reflection', label: 'Осмысление' },
  { id: 'tomorrow', label: 'Завтра' },
  { id: 'preparation', label: 'Подготовка' },
  { id: 'shutdown', label: 'Завершение' },
] as const;

export type EveningStepId = (typeof EVENING_STEPS)[number]['id'];

export interface EveningKpiItem {
  readonly label: string;
  readonly value: string;
  readonly meta: string;
  readonly icon: EveningVisualIconName;
  readonly tone: 'neutral' | 'current' | 'ready';
}

export interface EveningNotStartedFact {
  readonly label: string;
  readonly value: string;
  readonly meta: string;
  readonly icon: EveningVisualIconName;
  readonly tone: EveningKpiItem['tone'];
}

export interface EveningNotStartedSceneModel {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly facts: readonly EveningNotStartedFact[];
}

export function eveningJourneyIdForState(state: EveningCycleState): SelectedEveningView {
  if (state === EVENING_CYCLE_STATE.reflecting) return 'reflection';
  if (state === EVENING_CYCLE_STATE.planningTomorrow) return 'tomorrow';
  if (state === EVENING_CYCLE_STATE.preparing) return 'preparation';
  if (state === EVENING_CYCLE_STATE.relaxing) return 'relaxation';
  if (state === EVENING_CYCLE_STATE.sleepCheck) return 'sleep';
  if (state === EVENING_CYCLE_STATE.shutdown) return 'shutdown';
  if (state === EVENING_CYCLE_STATE.completed) return 'recovery';
  return 'today';
}

export function defaultEveningView(state: EveningCycleState): SelectedEveningView {
  return eveningJourneyIdForState(state);
}

export function eveningStepIdForView(view: SelectedEveningView): EveningStepId {
  if (view === 'relaxation' || view === 'sleep') return 'preparation';
  if (view === 'recovery') return 'shutdown';
  return view;
}

export function isEveningViewAvailable(
  state: EveningCycleState,
  view: SelectedEveningView,
): boolean {
  if (state === EVENING_CYCLE_STATE.completed) return true;
  if (view === 'recovery') return false;
  const domainView = eveningJourneyIdForState(state);
  if (domainView === 'recovery') return false;
  const domainIndex = EVENING_JOURNEY.findIndex((item) => item.id === domainView);
  const requestedIndex = EVENING_JOURNEY.findIndex((item) => item.id === view);
  return requestedIndex >= 0 && requestedIndex <= domainIndex;
}

export function eveningReturnToCurrentLabel(view: SelectedEveningView): string {
  if (view === 'reflection') return 'Вернуться к осмыслению';
  if (view === 'tomorrow') return 'Вернуться к планированию завтра';
  if (view === 'preparation') return 'Вернуться к среде';
  if (view === 'relaxation') return 'Вернуться к расслаблению';
  if (view === 'sleep') return 'Вернуться к проверке сна';
  if (view === 'shutdown') return 'Вернуться к завершению';
  if (view === 'recovery') return 'Вернуться к восстановлению';
  return 'Вернуться к разбору дня';
}

export function selectEveningView(
  state: EveningCycleState,
  current: SelectedEveningView,
  requested: SelectedEveningView,
): SelectedEveningView {
  return isEveningViewAvailable(state, requested) ? requested : current;
}

export function buildEveningKpis(
  snapshot: EveningReviewSnapshot,
  reflection: ReflectionSession | null,
  tomorrowPlanPrepared = false,
): readonly EveningKpiItem[] {
  const cycle = reflection?.cycle ?? snapshot.cycle;
  const openLoopCount = snapshot.openLoops?.remaining;
  const tomorrowCount = snapshot.tomorrowDecisions.length;
  const tomorrowPrepared = tomorrowPlanPrepared || tomorrowCount > 0;

  return Object.freeze([
    Object.freeze({
      label: 'Осталось сегодня',
      value:
        openLoopCount === undefined
          ? '—'
          : openLoopCount === 0
            ? 'Всё разобрано'
            : `${openLoopCount} ${pluralize(openLoopCount, 'элемент', 'элемента', 'элементов')}`,
      meta:
        openLoopCount === undefined
          ? 'Данные уточняются'
          : openLoopCount === 0
            ? 'День собран'
            : 'Требует решения',
      icon: 'list',
      tone:
        openLoopCount === undefined
          ? 'neutral'
          : openLoopCount === 0
            ? 'ready'
            : journeyTone(cycle.state, 'today'),
    }),
    Object.freeze({
      label: 'Завтра',
      value: tomorrowPrepared ? 'Подготовлено' : 'Не подготовлено',
      meta:
        tomorrowCount > 0
          ? `${tomorrowCount} ${pluralize(tomorrowCount, 'решение', 'решения', 'решений')}`
          : tomorrowPrepared
            ? 'План сохранён'
            : 'Соберём во время вечера',
      icon: 'calendar',
      tone: tomorrowPrepared ? 'ready' : 'neutral',
    }),
    Object.freeze({
      label: 'Режим',
      value: eveningModeLabel(cycle.mode),
      meta: 'Режим завершения',
      icon: 'moon',
      tone: 'neutral',
    }),
  ]);
}

export function buildEveningNotStartedSceneModel(
  snapshot: EveningReviewSnapshot,
): EveningNotStartedSceneModel {
  const unfinishedDecisions = snapshot.decisions.filter(
    (decision) =>
      decision.status === DECISION_STATUS.planned || decision.status === DECISION_STATUS.inProgress,
  ).length;
  const unfinishedActions = snapshot.lifeActions.filter(isUnfinishedAction).length;
  const unfinishedCount = unfinishedDecisions + unfinishedActions;
  const tomorrowCount = snapshot.tomorrowDecisions.length;

  return Object.freeze({
    eyebrow: 'Сегодня',
    title: 'Сегодняшний вечер ещё не начат',
    description: 'Завершите день спокойно и подготовьте ясный старт завтра.',
    facts: Object.freeze([
      Object.freeze({
        label: 'Незавершённое',
        value:
          unfinishedCount === 0
            ? 'Нет'
            : `${unfinishedCount} ${pluralize(
                unfinishedCount,
                'элемент',
                'элемента',
                'элементов',
              )}`,
        meta: unfinishedCount === 0 ? 'Всё разобрано' : 'Требует решения',
        icon: 'list',
        tone: unfinishedCount === 0 ? 'ready' : 'current',
      }),
      Object.freeze({
        label: 'Активная сессия',
        value: snapshot.unfinishedSession === null ? 'Нет' : 'Есть',
        meta:
          snapshot.unfinishedSession === null ? 'Ничего не запущено' : 'Будет учтена при разборе',
        icon: 'clock',
        tone: 'neutral',
      }),
      Object.freeze({
        label: 'Завтра',
        value:
          tomorrowCount === 0
            ? 'Не подготовлено'
            : `${tomorrowCount} ${pluralize(tomorrowCount, 'решение', 'решения', 'решений')}`,
        meta: tomorrowCount === 0 ? 'Соберём во время вечера' : 'План уже начат',
        icon: 'calendar',
        tone: 'neutral',
      }),
    ]),
  });
}

export function eveningModeLabel(mode: EveningCycleMode): string {
  if (mode === EVENING_CYCLE_MODE.quick) return 'Быстрый';
  if (mode === EVENING_CYCLE_MODE.emergency) return 'Позднее завершение';
  return 'Обычный';
}

function journeyTone(
  state: EveningCycleState,
  journeyId: EveningJourneyId,
): EveningKpiItem['tone'] {
  const activeId = eveningJourneyIdForState(state);
  const activeIndex = EVENING_JOURNEY.findIndex((item) => item.id === activeId);
  const itemIndex = EVENING_JOURNEY.findIndex((item) => item.id === journeyId);
  if (state === EVENING_CYCLE_STATE.completed || itemIndex < activeIndex) return 'ready';
  if (itemIndex === activeIndex) return 'current';
  return 'neutral';
}

function pluralize(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
