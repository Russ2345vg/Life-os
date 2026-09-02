import {
  EVENING_CYCLE_MODE,
  RELAXATION_PRACTICE,
  SCREEN_FREE_STATE,
  type EveningCycle,
  type RelaxationPractice,
  type ScreenFreeState,
} from '../../domain';

export const RELAXATION_PRACTICE_OPTIONS = Object.freeze([
  { value: RELAXATION_PRACTICE.reading, label: 'Чтение' },
  { value: RELAXATION_PRACTICE.breathing, label: 'Дыхание' },
  { value: RELAXATION_PRACTICE.stretching, label: 'Растяжка' },
  { value: RELAXATION_PRACTICE.meditation, label: 'Медитация' },
  { value: RELAXATION_PRACTICE.calmMusic, label: 'Спокойная музыка' },
] as const);

export type RelaxationTimerState = 'NOT_STARTED' | 'RUNNING' | 'EXPIRED' | 'COMPLETED';
export type RelaxationScreenFreeViewState = ScreenFreeState | 'ELAPSED';

export interface EveningRelaxationModel {
  readonly available: boolean;
  readonly readOnly: boolean;
  readonly legacyMessage: string | null;
  readonly shortMode: boolean;
  readonly durationRange: Readonly<{ min: number; max: number }>;
  readonly selectedPractice: RelaxationPractice | null;
  readonly selectedPracticeLabel: string;
  readonly defaultPractice: RelaxationPractice | null;
  readonly defaultPracticeLabel: string;
  readonly defaultChangedForFuture: boolean;
  readonly practiceDurationMinutes: number;
  readonly drinkCompleted: boolean;
  readonly hygieneCompleted: boolean;
  readonly practiceCompleted: boolean;
  readonly practiceTimer: Readonly<{
    state: RelaxationTimerState;
    remainingSeconds: number;
    label: string;
  }>;
  readonly screenFree: Readonly<{
    state: RelaxationScreenFreeViewState;
    durationMinutes: number;
    remainingSeconds: number;
    outcomeLabel: string;
    tone: 'neutral' | 'current' | 'ready' | 'skipped';
  }>;
  readonly ready: boolean;
  readonly disabledReason: string | null;
  readonly continuationLabel: 'Перейти ко сну';
  readonly hasActiveClock: boolean;
}

export function buildEveningRelaxationModel(
  cycle: EveningCycle,
  now: Date,
  readOnly: boolean,
): EveningRelaxationModel {
  const relaxation = cycle.relaxation;
  if (relaxation === null) return legacyModel(readOnly);
  const shortMode = cycle.mode === EVENING_CYCLE_MODE.quick;

  const practiceCompleted = relaxation.practiceCompletedAt !== null;
  const timerRemaining = remainingSeconds(
    relaxation.practiceTimerStartedAt,
    relaxation.practiceDurationMinutes,
    now,
  );
  const timerState: RelaxationTimerState = practiceCompleted
    ? 'COMPLETED'
    : relaxation.practiceTimerStartedAt === null
      ? 'NOT_STARTED'
      : timerRemaining === 0
        ? 'EXPIRED'
        : 'RUNNING';
  const screenRemaining = remainingSeconds(
    relaxation.screenFreeStartedAt,
    relaxation.screenFreeDurationMinutes,
    now,
  );
  const screenElapsed = relaxation.screenFreeElapsedAt(now);
  const screenState: RelaxationScreenFreeViewState = screenElapsed
    ? 'ELAPSED'
    : relaxation.screenFreeState;
  const screenReady =
    screenElapsed ||
    relaxation.screenFreeState === SCREEN_FREE_STATE.completed ||
    relaxation.screenFreeState === SCREEN_FREE_STATE.skipped;
  const ready = shortMode ? relaxation.readyForShortAt(now) : relaxation.readyAt(now);

  return Object.freeze({
    available: true,
    readOnly,
    legacyMessage: null,
    shortMode,
    durationRange: Object.freeze(shortMode ? { min: 2, max: 5 } : { min: 5, max: 20 }),
    selectedPractice: relaxation.selectedPractice,
    selectedPracticeLabel: practiceLabel(relaxation.selectedPractice),
    defaultPractice: relaxation.defaultPractice,
    defaultPracticeLabel: practiceLabel(relaxation.defaultPractice),
    defaultChangedForFuture: relaxation.defaultChangedForFuture,
    practiceDurationMinutes: relaxation.practiceDurationMinutes,
    drinkCompleted: relaxation.drinkCompletedAt !== null,
    hygieneCompleted: relaxation.hygieneCompletedAt !== null,
    practiceCompleted,
    practiceTimer: Object.freeze({
      state: timerState,
      remainingSeconds: timerRemaining,
      label: timerLabel(timerState, timerRemaining),
    }),
    screenFree: Object.freeze({
      state: screenState,
      durationMinutes: relaxation.screenFreeDurationMinutes,
      remainingSeconds: screenRemaining,
      outcomeLabel: screenFreeLabel(screenState, screenRemaining),
      tone: screenFreeTone(screenState),
    }),
    ready,
    disabledReason: shortMode
      ? relaxation.hygieneCompletedAt === null
        ? 'Завершите гигиену'
        : !practiceCompleted
          ? 'Завершите практику'
          : null
      : relaxation.drinkCompletedAt === null
        ? 'Завершите напиток'
        : relaxation.hygieneCompletedAt === null
          ? 'Завершите гигиену'
          : !screenReady
            ? 'Завершите период без экранов'
            : !practiceCompleted
              ? 'Завершите практику'
              : null,
    continuationLabel: 'Перейти ко сну',
    hasActiveClock:
      !readOnly &&
      (timerState === 'RUNNING' ||
        (screenState === SCREEN_FREE_STATE.active && screenRemaining > 0)),
  });
}

export function formatRelaxationCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

function legacyModel(readOnly: boolean): EveningRelaxationModel {
  return Object.freeze({
    available: false,
    readOnly,
    legacyMessage: 'Расслабление не записывалось для этого вечера',
    shortMode: false,
    durationRange: Object.freeze({ min: 5, max: 20 }),
    selectedPractice: null,
    selectedPracticeLabel: 'Не записано',
    defaultPractice: null,
    defaultPracticeLabel: 'Не записано',
    defaultChangedForFuture: false,
    practiceDurationMinutes: 0,
    drinkCompleted: false,
    hygieneCompleted: false,
    practiceCompleted: false,
    practiceTimer: Object.freeze({
      state: 'NOT_STARTED' as const,
      remainingSeconds: 0,
      label: 'Не запускался',
    }),
    screenFree: Object.freeze({
      state: SCREEN_FREE_STATE.pending,
      durationMinutes: 0,
      remainingSeconds: 0,
      outcomeLabel: 'Не записано',
      tone: 'neutral' as const,
    }),
    ready: false,
    disabledReason: null,
    continuationLabel: 'Перейти ко сну',
    hasActiveClock: false,
  });
}

function practiceLabel(practice: RelaxationPractice): string {
  return (
    RELAXATION_PRACTICE_OPTIONS.find((option) => option.value === practice)?.label ??
    'Неизвестная практика'
  );
}

function remainingSeconds(startedAt: Date | null, durationMinutes: number, now: Date): number {
  if (startedAt === null) return durationMinutes * 60;
  const elapsed = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  return Math.max(0, durationMinutes * 60 - elapsed);
}

function timerLabel(state: RelaxationTimerState, remaining: number): string {
  if (state === 'COMPLETED') return 'Выполнено';
  if (state === 'NOT_STARTED') return 'Таймер не запущен';
  if (state === 'EXPIRED') return 'Время вышло — отметьте выполнение вручную';
  return formatRelaxationCountdown(remaining);
}

function screenFreeLabel(state: RelaxationScreenFreeViewState, remaining: number): string {
  if (state === SCREEN_FREE_STATE.skipped) return 'Пропущено сегодня';
  if (state === SCREEN_FREE_STATE.completed || state === 'ELAPSED') return 'Окно завершено';
  if (state === SCREEN_FREE_STATE.active) return formatRelaxationCountdown(remaining);
  return 'Можно начать в удобный момент';
}

function screenFreeTone(
  state: RelaxationScreenFreeViewState,
): EveningRelaxationModel['screenFree']['tone'] {
  if (state === SCREEN_FREE_STATE.skipped) return 'skipped';
  if (state === SCREEN_FREE_STATE.completed || state === 'ELAPSED') return 'ready';
  if (state === SCREEN_FREE_STATE.active) return 'current';
  return 'neutral';
}
