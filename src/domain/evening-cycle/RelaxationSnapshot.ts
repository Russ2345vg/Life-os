import { DomainError } from '../../shared/errors/DomainError';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';

export const RELAXATION_PRACTICE = {
  reading: 'READING',
  breathing: 'BREATHING',
  stretching: 'STRETCHING',
  meditation: 'MEDITATION',
  calmMusic: 'CALM_MUSIC',
} as const;

export type RelaxationPractice = (typeof RELAXATION_PRACTICE)[keyof typeof RELAXATION_PRACTICE];

export const SCREEN_FREE_STATE = {
  pending: 'PENDING',
  active: 'ACTIVE',
  skipped: 'SKIPPED',
  completed: 'COMPLETED',
} as const;

export type ScreenFreeState = (typeof SCREEN_FREE_STATE)[keyof typeof SCREEN_FREE_STATE];
export type ScreenFreeDurationMinutes = number;

export interface RelaxationSnapshotStartData {
  readonly defaultPractice: RelaxationPractice;
  readonly practiceDurationMinutes: number;
  readonly screenFreeDurationMinutes: ScreenFreeDurationMinutes;
  readonly occurredAt: Date;
}

export interface RelaxationSnapshotRehydrationData {
  readonly defaultPractice: RelaxationPractice;
  readonly selectedPractice: RelaxationPractice;
  readonly defaultChangedForFuture: boolean;
  readonly practiceDurationMinutes: number;
  readonly drinkCompletedAt: Date | null;
  readonly hygieneCompletedAt: Date | null;
  readonly practiceTimerStartedAt: Date | null;
  readonly practiceCompletedAt: Date | null;
  readonly screenFreeDurationMinutes: ScreenFreeDurationMinutes;
  readonly screenFreeState: ScreenFreeState;
  readonly screenFreeStartedAt: Date | null;
  readonly screenFreeSkippedAt: Date | null;
  readonly screenFreeCompletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class RelaxationSnapshot {
  #defaultPractice: RelaxationPractice;
  #selectedPractice: RelaxationPractice;
  #defaultChangedForFuture: boolean;
  #practiceDurationMinutes: number;
  #drinkCompletedAt: Date | null;
  #hygieneCompletedAt: Date | null;
  #practiceTimerStartedAt: Date | null;
  #practiceCompletedAt: Date | null;
  #screenFreeDurationMinutes: ScreenFreeDurationMinutes;
  #screenFreeState: ScreenFreeState;
  #screenFreeStartedAt: Date | null;
  #screenFreeSkippedAt: Date | null;
  #screenFreeCompletedAt: Date | null;
  readonly #createdAt: Date;
  #updatedAt: Date;

  private constructor(data: RelaxationSnapshotRehydrationData) {
    this.#defaultPractice = data.defaultPractice;
    this.#selectedPractice = data.selectedPractice;
    this.#defaultChangedForFuture = data.defaultChangedForFuture;
    this.#practiceDurationMinutes = data.practiceDurationMinutes;
    this.#drinkCompletedAt = copyOptionalDate(data.drinkCompletedAt);
    this.#hygieneCompletedAt = copyOptionalDate(data.hygieneCompletedAt);
    this.#practiceTimerStartedAt = copyOptionalDate(data.practiceTimerStartedAt);
    this.#practiceCompletedAt = copyOptionalDate(data.practiceCompletedAt);
    this.#screenFreeDurationMinutes = data.screenFreeDurationMinutes;
    this.#screenFreeState = data.screenFreeState;
    this.#screenFreeStartedAt = copyOptionalDate(data.screenFreeStartedAt);
    this.#screenFreeSkippedAt = copyOptionalDate(data.screenFreeSkippedAt);
    this.#screenFreeCompletedAt = copyOptionalDate(data.screenFreeCompletedAt);
    this.#createdAt = copyDate(data.createdAt);
    this.#updatedAt = copyDate(data.updatedAt);
  }

  public static start(data: RelaxationSnapshotStartData): RelaxationSnapshot {
    assertPractice(data.defaultPractice);
    assertPracticeDuration(data.practiceDurationMinutes);
    assertScreenFreeDuration(data.screenFreeDurationMinutes);
    assertDate(data.occurredAt, 'Время начала расслабления');
    return new RelaxationSnapshot({
      defaultPractice: data.defaultPractice,
      selectedPractice: data.defaultPractice,
      defaultChangedForFuture: false,
      practiceDurationMinutes: data.practiceDurationMinutes,
      drinkCompletedAt: null,
      hygieneCompletedAt: null,
      practiceTimerStartedAt: null,
      practiceCompletedAt: null,
      screenFreeDurationMinutes: data.screenFreeDurationMinutes,
      screenFreeState: SCREEN_FREE_STATE.pending,
      screenFreeStartedAt: null,
      screenFreeSkippedAt: null,
      screenFreeCompletedAt: null,
      createdAt: data.occurredAt,
      updatedAt: data.occurredAt,
    });
  }

  public static rehydrate(data: RelaxationSnapshotRehydrationData): RelaxationSnapshot {
    assertRehydration(data);
    return new RelaxationSnapshot(data);
  }

  public get defaultPractice(): RelaxationPractice {
    return this.#defaultPractice;
  }

  public get selectedPractice(): RelaxationPractice {
    return this.#selectedPractice;
  }

  public get defaultChangedForFuture(): boolean {
    return this.#defaultChangedForFuture;
  }

  public get practiceDurationMinutes(): number {
    return this.#practiceDurationMinutes;
  }

  public get drinkCompletedAt(): Date | null {
    return copyOptionalDate(this.#drinkCompletedAt);
  }

  public get hygieneCompletedAt(): Date | null {
    return copyOptionalDate(this.#hygieneCompletedAt);
  }

  public get practiceTimerStartedAt(): Date | null {
    return copyOptionalDate(this.#practiceTimerStartedAt);
  }

  public get practiceCompletedAt(): Date | null {
    return copyOptionalDate(this.#practiceCompletedAt);
  }

  public get screenFreeDurationMinutes(): ScreenFreeDurationMinutes {
    return this.#screenFreeDurationMinutes;
  }

  public get screenFreeState(): ScreenFreeState {
    return this.#screenFreeState;
  }

  public get screenFreeStartedAt(): Date | null {
    return copyOptionalDate(this.#screenFreeStartedAt);
  }

  public get screenFreeSkippedAt(): Date | null {
    return copyOptionalDate(this.#screenFreeSkippedAt);
  }

  public get screenFreeCompletedAt(): Date | null {
    return copyOptionalDate(this.#screenFreeCompletedAt);
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  public get updatedAt(): Date {
    return copyDate(this.#updatedAt);
  }

  public choosePractice(
    practice: RelaxationPractice,
    persistAsDefault: boolean,
    occurredAt: Date,
  ): boolean {
    this.assertPracticeMutable();
    assertPractice(practice);
    assertDate(occurredAt, 'Время выбора практики');
    const selectionChanged = this.#selectedPractice !== practice;
    const defaultChanged =
      persistAsDefault && (this.#defaultPractice !== practice || !this.#defaultChangedForFuture);
    if (!selectionChanged && !defaultChanged) return false;
    this.#selectedPractice = practice;
    if (persistAsDefault) {
      this.#defaultPractice = practice;
      this.#defaultChangedForFuture = true;
    }
    if (selectionChanged) this.#practiceTimerStartedAt = null;
    this.touch(occurredAt);
    return true;
  }

  public setPracticeDuration(minutes: number, occurredAt: Date): boolean {
    this.assertPracticeMutable();
    assertPracticeDuration(minutes);
    assertDate(occurredAt, 'Время изменения длительности практики');
    if (this.#practiceDurationMinutes === minutes) return false;
    this.#practiceDurationMinutes = minutes;
    this.#practiceTimerStartedAt = null;
    this.touch(occurredAt);
    return true;
  }

  public setShortPracticeDuration(minutes: number, occurredAt: Date): boolean {
    this.assertPracticeMutable();
    assertShortPracticeDuration(minutes);
    assertDate(occurredAt, 'Время изменения длительности короткой практики');
    if (this.#practiceDurationMinutes === minutes) return false;
    this.#practiceDurationMinutes = minutes;
    this.#practiceTimerStartedAt = null;
    this.touch(occurredAt);
    return true;
  }

  public completeDrink(occurredAt: Date): boolean {
    if (this.#drinkCompletedAt !== null) return false;
    assertDate(occurredAt, 'Время завершения действия с напитком');
    this.#drinkCompletedAt = copyDate(occurredAt);
    this.touch(occurredAt);
    return true;
  }

  public completeHygiene(occurredAt: Date): boolean {
    if (this.#hygieneCompletedAt !== null) return false;
    assertDate(occurredAt, 'Время завершения гигиены');
    this.#hygieneCompletedAt = copyDate(occurredAt);
    this.touch(occurredAt);
    return true;
  }

  public startPracticeTimer(occurredAt: Date): boolean {
    this.assertPracticeMutable();
    if (this.#practiceTimerStartedAt !== null) return false;
    assertDate(occurredAt, 'Время запуска таймера практики');
    this.#practiceTimerStartedAt = copyDate(occurredAt);
    this.touch(occurredAt);
    return true;
  }

  public completePractice(occurredAt: Date): boolean {
    if (this.#practiceCompletedAt !== null) return false;
    assertDate(occurredAt, 'Время завершения практики');
    this.#practiceCompletedAt = copyDate(occurredAt);
    this.touch(occurredAt);
    return true;
  }

  public startScreenFree(occurredAt: Date): boolean {
    if (this.#screenFreeState === SCREEN_FREE_STATE.active) return false;
    this.assertScreenFreeMutable();
    assertDate(occurredAt, 'Время начала периода без экранов');
    this.#screenFreeState = SCREEN_FREE_STATE.active;
    this.#screenFreeStartedAt = copyDate(occurredAt);
    this.touch(occurredAt);
    return true;
  }

  public shortenScreenFree(occurredAt: Date): boolean {
    this.assertScreenFreeMutable();
    if (this.#screenFreeDurationMinutes === 10) return false;
    assertDate(occurredAt, 'Время сокращения периода без экранов');
    this.#screenFreeDurationMinutes = 10;
    this.touch(occurredAt);
    return true;
  }

  public skipScreenFree(occurredAt: Date): boolean {
    if (this.#screenFreeState === SCREEN_FREE_STATE.skipped) return false;
    this.assertScreenFreeMutable();
    assertDate(occurredAt, 'Время пропуска периода без экранов');
    this.#screenFreeState = SCREEN_FREE_STATE.skipped;
    this.#screenFreeSkippedAt = copyDate(occurredAt);
    this.touch(occurredAt);
    return true;
  }

  public screenFreeElapsedAt(now: Date): boolean {
    assertDate(now, 'Текущее время периода без экранов');
    if (this.#screenFreeState !== SCREEN_FREE_STATE.active || this.#screenFreeStartedAt === null) {
      return false;
    }
    return (
      now.getTime() >=
      this.#screenFreeStartedAt.getTime() + this.#screenFreeDurationMinutes * 60_000
    );
  }

  public readyAt(now: Date): boolean {
    assertDate(now, 'Текущее время проверки готовности');
    const screenFreeReady =
      this.#screenFreeState === SCREEN_FREE_STATE.skipped ||
      this.#screenFreeState === SCREEN_FREE_STATE.completed ||
      this.screenFreeElapsedAt(now);
    return (
      this.#drinkCompletedAt !== null &&
      this.#hygieneCompletedAt !== null &&
      this.#practiceCompletedAt !== null &&
      screenFreeReady
    );
  }

  public readyForShortAt(now: Date): boolean {
    assertDate(now, 'Текущее время проверки короткой практики');
    return this.#hygieneCompletedAt !== null && this.#practiceCompletedAt !== null;
  }

  public completeElapsedScreenFree(now: Date): boolean {
    if (this.#screenFreeState === SCREEN_FREE_STATE.completed) return false;
    if (this.#screenFreeState === SCREEN_FREE_STATE.skipped) return false;
    if (!this.screenFreeElapsedAt(now)) {
      throw new DomainError(
        'relaxation.screen_free_not_elapsed',
        'Период без экранов ещё не завершён.',
      );
    }
    this.#screenFreeState = SCREEN_FREE_STATE.completed;
    this.#screenFreeCompletedAt = copyDate(now);
    this.touch(now);
    return true;
  }

  private assertPracticeMutable(): void {
    if (this.#practiceCompletedAt !== null) {
      throw new DomainError(
        'relaxation.practice_completed',
        'Завершённую практику нельзя изменить.',
      );
    }
  }

  private assertScreenFreeMutable(): void {
    if (
      this.#screenFreeState === SCREEN_FREE_STATE.skipped ||
      this.#screenFreeState === SCREEN_FREE_STATE.completed
    ) {
      throw new DomainError(
        'relaxation.screen_free_final',
        'Решение по периоду без экранов уже сохранено.',
      );
    }
  }

  private touch(occurredAt: Date): void {
    this.#updatedAt = copyDate(occurredAt);
  }
}

export function isRelaxationPractice(value: string): value is RelaxationPractice {
  return (Object.values(RELAXATION_PRACTICE) as readonly string[]).includes(value);
}

export function isScreenFreeState(value: string): value is ScreenFreeState {
  return (Object.values(SCREEN_FREE_STATE) as readonly string[]).includes(value);
}

export function isScreenFreeDurationMinutes(value: number): value is ScreenFreeDurationMinutes {
  return value === 10 || (Number.isInteger(value) && value >= 20 && value <= 30);
}

function assertRehydration(data: RelaxationSnapshotRehydrationData): void {
  assertPractice(data.defaultPractice);
  assertPractice(data.selectedPractice);
  if (typeof data.defaultChangedForFuture !== 'boolean') {
    throw new DomainError(
      'relaxation.invalid_default_change',
      'Признак изменения практики по умолчанию некорректен.',
    );
  }
  assertRehydratedPracticeDuration(data.practiceDurationMinutes);
  assertScreenFreeDuration(data.screenFreeDurationMinutes);
  assertDate(data.createdAt, 'Время создания расслабления');
  assertDate(data.updatedAt, 'Время обновления расслабления');
  for (const [label, value] of [
    ['напитка', data.drinkCompletedAt],
    ['гигиены', data.hygieneCompletedAt],
    ['таймера практики', data.practiceTimerStartedAt],
    ['практики', data.practiceCompletedAt],
    ['начала без экранов', data.screenFreeStartedAt],
    ['пропуска без экранов', data.screenFreeSkippedAt],
    ['завершения без экранов', data.screenFreeCompletedAt],
  ] as const) {
    if (value !== null) assertDate(value, `Время ${label}`);
  }
  assertScreenFreeState(data);
}

function assertScreenFreeState(data: RelaxationSnapshotRehydrationData): void {
  const invalid = (): never => {
    throw new DomainError(
      'relaxation.invalid_screen_free_state',
      'Сохранённое состояние периода без экранов некорректно.',
    );
  };
  if (data.screenFreeState === SCREEN_FREE_STATE.pending) {
    if (
      data.screenFreeStartedAt !== null ||
      data.screenFreeSkippedAt !== null ||
      data.screenFreeCompletedAt !== null
    ) {
      invalid();
    }
    return;
  }
  if (data.screenFreeState === SCREEN_FREE_STATE.active) {
    if (
      data.screenFreeStartedAt === null ||
      data.screenFreeSkippedAt !== null ||
      data.screenFreeCompletedAt !== null
    ) {
      invalid();
    }
    return;
  }
  if (data.screenFreeState === SCREEN_FREE_STATE.skipped) {
    if (data.screenFreeSkippedAt === null || data.screenFreeCompletedAt !== null) invalid();
    return;
  }
  if (data.screenFreeState === SCREEN_FREE_STATE.completed) {
    if (
      data.screenFreeStartedAt === null ||
      data.screenFreeSkippedAt !== null ||
      data.screenFreeCompletedAt === null
    ) {
      invalid();
    }
    return;
  }
  invalid();
}

function assertPractice(value: RelaxationPractice): void {
  if (!isRelaxationPractice(value)) {
    throw new DomainError('relaxation.invalid_practice', 'Неизвестная практика расслабления.');
  }
}

function assertPracticeDuration(value: number): void {
  if (!Number.isInteger(value) || value < 5 || value > 20) {
    throw new DomainError(
      'relaxation.invalid_practice_duration',
      'Длительность практики должна быть целым числом от 5 до 20 минут.',
    );
  }
}

function assertShortPracticeDuration(value: number): void {
  if (!Number.isInteger(value) || value < 2 || value > 5) {
    throw new DomainError(
      'relaxation.short_duration_out_of_range',
      'Короткая практика должна длиться от 2 до 5 минут.',
    );
  }
}

function assertRehydratedPracticeDuration(value: number): void {
  if (!Number.isInteger(value) || value < 2 || value > 20) {
    throw new DomainError(
      'relaxation.invalid_practice_duration',
      'Сохранённая длительность практики должна быть целым числом от 2 до 20 минут.',
    );
  }
}

function assertScreenFreeDuration(value: number): asserts value is ScreenFreeDurationMinutes {
  if (!isScreenFreeDurationMinutes(value)) {
    throw new DomainError(
      'relaxation.invalid_screen_free_duration',
      'Период без экранов должен быть 10 или целым числом от 20 до 30 минут.',
    );
  }
}

function assertDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError('relaxation.invalid_time', `${label} содержит некорректное время.`);
  }
}
