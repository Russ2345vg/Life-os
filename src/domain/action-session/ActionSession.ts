import { DomainError } from '../../shared/errors/DomainError';
import type { DomainEvent } from '../shared/DomainEvent';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { ACTION_SESSION_STATUS, type ActionSessionStatus } from './ActionSessionStatus';
import { PauseInterval } from './PauseInterval';
import { SESSION_COMPLETION_KIND, type SessionCompletionKind } from './SessionCompletionKind';
import { SessionResultNote } from './SessionResultNote';
import {
  ActionSessionCompleted,
  ActionSessionPaused,
  ActionSessionResumed,
  ActionSessionStarted,
} from './events';

export interface ActionSessionStartInput {
  readonly kind?: 'work' | 'focus';
  readonly id: EntityId;
  readonly lifeActionId: EntityId;
  readonly goalIdAtStart?: EntityId | null;
  readonly startedAt: Date;
  readonly eventId: EntityId;
}

export interface ActionSessionCompletionInput {
  readonly completedAt: Date;
  readonly completionKind: SessionCompletionKind;
  readonly resultNote?: SessionResultNote;
  readonly eventId: EntityId;
}

export interface ActionSessionRehydrationData {
  readonly kind?: 'work' | 'focus';
  readonly id: EntityId;
  readonly lifeActionId: EntityId;
  readonly goalIdAtStart?: EntityId | null;
  readonly status: ActionSessionStatus;
  readonly startedAt: Date;
  readonly pausedAt: Date | null;
  readonly completedAt: Date | null;
  readonly completionKind: SessionCompletionKind | null;
  readonly resultNote: SessionResultNote | null;
  readonly pauseIntervals: readonly PauseInterval[];
  readonly version: number;
}

export class ActionSession extends Entity {
  readonly #kind: 'work' | 'focus';
  readonly #lifeActionId: EntityId;
  readonly #goalIdAtStart: EntityId | null;
  readonly #startedAt: Date;
  readonly #domainEvents: DomainEvent[];
  #status: ActionSessionStatus;
  #pausedAt: Date | null;
  #completedAt: Date | null;
  #completionKind: SessionCompletionKind | null;
  #resultNote: SessionResultNote | null;
  #pauseIntervals: PauseInterval[];
  #version: number;

  private constructor(data: ActionSessionRehydrationData, domainEvents: DomainEvent[]) {
    super(data.id);
    assertSessionKind(data.kind);
    this.#kind = data.kind ?? 'work';
    this.#lifeActionId = data.lifeActionId;
    this.#goalIdAtStart = data.goalIdAtStart ?? null;
    this.#status = data.status;
    this.#startedAt = copyDate(data.startedAt);
    this.#pausedAt = copyOptionalDate(data.pausedAt);
    this.#completedAt = copyOptionalDate(data.completedAt);
    this.#completionKind = data.completionKind;
    this.#resultNote = data.resultNote;
    this.#pauseIntervals = [...data.pauseIntervals];
    this.#version = data.version;
    this.#domainEvents = domainEvents;
  }

  public static start(input: ActionSessionStartInput): ActionSession {
    assertSessionKind(input.kind);
    assertEntityId(input.id, 'Идентификатор сессии');
    assertEntityId(input.lifeActionId, 'Идентификатор действия');
    if (input.goalIdAtStart != null) assertEntityId(input.goalIdAtStart, 'Идентификатор цели');
    assertEntityId(input.eventId, 'Идентификатор события');
    assertValidDate(input.startedAt, 'Время начала сессии');

    const session = new ActionSession(
      {
        id: input.id,
        kind: input.kind ?? 'work',
        lifeActionId: input.lifeActionId,
        goalIdAtStart: input.goalIdAtStart ?? null,
        status: ACTION_SESSION_STATUS.running,
        startedAt: input.startedAt,
        pausedAt: null,
        completedAt: null,
        completionKind: null,
        resultNote: null,
        pauseIntervals: [],
        version: 1,
      },
      [],
    );

    session.#domainEvents.push(
      new ActionSessionStarted(input.eventId, session.id, session.#lifeActionId, input.startedAt),
    );

    return session;
  }

  public static rehydrate(data: ActionSessionRehydrationData): ActionSession {
    assertRehydrationInvariants(data);
    return new ActionSession(data, []);
  }

  public get lifeActionId(): EntityId {
    return this.#lifeActionId;
  }

  public get kind(): 'work' | 'focus' {
    return this.#kind;
  }

  public get goalIdAtStart(): EntityId | null {
    return this.#goalIdAtStart;
  }

  public get status(): ActionSessionStatus {
    return this.#status;
  }

  public get startedAt(): Date {
    return copyDate(this.#startedAt);
  }

  public get pausedAt(): Date | null {
    return copyOptionalDate(this.#pausedAt);
  }

  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }

  public get completionKind(): SessionCompletionKind | null {
    return this.#completionKind;
  }

  public get resultNote(): SessionResultNote | null {
    return this.#resultNote;
  }

  public get pauseIntervals(): readonly PauseInterval[] {
    return [...this.#pauseIntervals];
  }

  public get version(): number {
    return this.#version;
  }

  public pause(pausedAt: Date, eventId: EntityId): void {
    if (this.#status === ACTION_SESSION_STATUS.paused) {
      return;
    }

    if (this.#status !== ACTION_SESSION_STATUS.running) {
      throw new DomainError(
        'action_session.pause_requires_running',
        'Приостановить можно только выполняющуюся сессию.',
      );
    }

    assertEntityId(eventId, 'Идентификатор события');
    this.assertTransitionTime(pausedAt, 'Время постановки на паузу');

    this.#status = ACTION_SESSION_STATUS.paused;
    this.#pausedAt = copyDate(pausedAt);
    this.#version += 1;
    this.#domainEvents.push(
      new ActionSessionPaused(eventId, this.id, this.#lifeActionId, pausedAt),
    );
  }

  public resume(resumedAt: Date, eventId: EntityId): void {
    if (this.#status === ACTION_SESSION_STATUS.running) {
      return;
    }

    if (this.#status !== ACTION_SESSION_STATUS.paused || this.#pausedAt === null) {
      throw new DomainError(
        'action_session.resume_requires_paused',
        'Продолжить можно только приостановленную сессию.',
      );
    }

    assertEntityId(eventId, 'Идентификатор события');
    this.assertTransitionTime(resumedAt, 'Время продолжения сессии');
    const pausedAt = this.#pausedAt;
    const pauseInterval = PauseInterval.create(pausedAt, resumedAt);

    this.#pauseIntervals.push(pauseInterval);
    this.#pausedAt = null;
    this.#status = ACTION_SESSION_STATUS.running;
    this.#version += 1;
    this.#domainEvents.push(
      new ActionSessionResumed(eventId, this.id, this.#lifeActionId, pausedAt, resumedAt),
    );
  }

  public complete(input: ActionSessionCompletionInput): void {
    if (this.#status === ACTION_SESSION_STATUS.completed) {
      return;
    }

    assertEntityId(input.eventId, 'Идентификатор события');
    assertCompletionKind(input.completionKind);
    assertOptionalResultNote(input.resultNote ?? null);
    this.assertTransitionTime(input.completedAt, 'Время завершения сессии');

    const finalPauseInterval =
      this.#status === ACTION_SESSION_STATUS.paused && this.#pausedAt !== null
        ? PauseInterval.create(this.#pausedAt, input.completedAt)
        : null;
    const pauseIntervals =
      finalPauseInterval === null
        ? this.#pauseIntervals
        : [...this.#pauseIntervals, finalPauseInterval];
    const elapsedDuration = input.completedAt.getTime() - this.#startedAt.getTime();
    const pausedDuration = sumPauseDurations(pauseIntervals);
    const workedDuration = elapsedDuration - pausedDuration;

    if (workedDuration < 0) {
      throw new DomainError(
        'action_session.negative_worked_duration',
        'Рабочая длительность сессии не может быть отрицательной.',
      );
    }

    this.#pauseIntervals = [...pauseIntervals];
    this.#status = ACTION_SESSION_STATUS.completed;
    this.#pausedAt = null;
    this.#completedAt = copyDate(input.completedAt);
    this.#completionKind = input.completionKind;
    this.#resultNote = input.resultNote ?? null;
    this.#version += 1;
    this.#domainEvents.push(
      new ActionSessionCompleted(
        input.eventId,
        this.id,
        this.#lifeActionId,
        input.completionKind,
        workedDuration,
        pausedDuration,
        input.resultNote ?? null,
        input.completedAt,
      ),
    );
  }

  public elapsedDurationAt(now: Date): number {
    const effectiveNow = this.durationCalculationTime(now);
    return effectiveNow.getTime() - this.#startedAt.getTime();
  }

  public pausedDurationAt(now: Date): number {
    const effectiveNow = this.durationCalculationTime(now);
    const completedPauseDuration = sumPauseDurations(this.#pauseIntervals);

    if (this.#status !== ACTION_SESSION_STATUS.paused || this.#pausedAt === null) {
      return completedPauseDuration;
    }

    return completedPauseDuration + effectiveNow.getTime() - this.#pausedAt.getTime();
  }

  public workedDurationAt(now: Date): number {
    const workedDuration = this.elapsedDurationAt(now) - this.pausedDurationAt(now);

    if (workedDuration < 0) {
      throw new DomainError(
        'action_session.negative_worked_duration',
        'Рабочая длительность сессии не может быть отрицательной.',
      );
    }

    return workedDuration;
  }

  public isRunning(): boolean {
    return this.#status === ACTION_SESSION_STATUS.running;
  }

  public isPaused(): boolean {
    return this.#status === ACTION_SESSION_STATUS.paused;
  }

  public isCompleted(): boolean {
    return this.#status === ACTION_SESSION_STATUS.completed;
  }

  public isInterrupted(): boolean {
    return (
      this.#status === ACTION_SESSION_STATUS.completed &&
      this.#completionKind === SESSION_COMPLETION_KIND.interrupted
    );
  }

  public getUncommittedEvents(): readonly DomainEvent[] {
    return [...this.#domainEvents];
  }

  public clearUncommittedEvents(): void {
    this.#domainEvents.length = 0;
  }

  private assertTransitionTime(value: Date, fieldName: string): void {
    assertValidDate(value, fieldName);

    if (value.getTime() < this.lastTransitionAt().getTime()) {
      throw new DomainError(
        'action_session.time_before_last_transition',
        `${fieldName} не может быть раньше предыдущего перехода сессии.`,
      );
    }
  }

  private durationCalculationTime(now: Date): Date {
    assertValidDate(now, 'Момент расчёта длительности');

    if (now.getTime() < this.#startedAt.getTime()) {
      throw new DomainError(
        'action_session.time_before_start',
        'Нельзя рассчитать длительность до начала сессии.',
      );
    }

    if (
      this.#status !== ACTION_SESSION_STATUS.completed &&
      now.getTime() < this.lastTransitionAt().getTime()
    ) {
      throw new DomainError(
        'action_session.time_before_last_transition',
        'Момент расчёта не может быть раньше последнего перехода сессии.',
      );
    }

    return this.#completedAt === null ? copyDate(now) : copyDate(this.#completedAt);
  }

  private lastTransitionAt(): Date {
    if (this.#pausedAt !== null) {
      return this.#pausedAt;
    }

    const lastPauseInterval = this.#pauseIntervals.at(-1);
    return lastPauseInterval?.endedAt ?? this.#startedAt;
  }
}

function assertRehydrationInvariants(data: ActionSessionRehydrationData): void {
  assertSessionKind(data.kind);
  assertEntityId(data.id, 'Идентификатор сессии');
  assertEntityId(data.lifeActionId, 'Идентификатор действия');
  if (data.goalIdAtStart != null) assertEntityId(data.goalIdAtStart, 'Идентификатор цели');
  assertSessionStatus(data.status);
  assertValidDate(data.startedAt, 'Время начала сессии');

  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new DomainError(
      'action_session.invalid_version',
      'Версия сессии должна быть не меньше 1.',
    );
  }

  assertOptionalDate(data.pausedAt, 'Время начала открытой паузы');
  assertOptionalDate(data.completedAt, 'Время завершения сессии');
  assertOptionalCompletionKind(data.completionKind);
  assertOptionalResultNote(data.resultNote);
  assertStateFields(data);
  assertPauseIntervals(data);
}

function assertSessionKind(kind: unknown): void {
  if (kind !== undefined && kind !== 'work' && kind !== 'focus')
    throw new DomainError('action_session.invalid_kind', 'Неизвестный вид рабочей сессии.');
}

function assertStateFields(data: ActionSessionRehydrationData): void {
  if (
    data.status === ACTION_SESSION_STATUS.running &&
    (data.pausedAt !== null || data.completedAt !== null || data.completionKind !== null)
  ) {
    throw new DomainError(
      'action_session.running_fields_invalid',
      'Выполняющаяся сессия не может иметь данные паузы или завершения.',
    );
  }

  if (
    data.status === ACTION_SESSION_STATUS.paused &&
    (data.pausedAt === null || data.completedAt !== null || data.completionKind !== null)
  ) {
    throw new DomainError(
      'action_session.paused_fields_invalid',
      'Приостановленная сессия должна иметь только время открытой паузы.',
    );
  }

  if (
    data.status === ACTION_SESSION_STATUS.completed &&
    (data.pausedAt !== null || data.completedAt === null || data.completionKind === null)
  ) {
    throw new DomainError(
      'action_session.completed_fields_invalid',
      'Завершённая сессия должна иметь время и вид завершения без открытой паузы.',
    );
  }

  if (data.status !== ACTION_SESSION_STATUS.completed && data.resultNote !== null) {
    throw new DomainError(
      'action_session.uncompleted_has_result_note',
      'Незавершённая сессия не может иметь запись о результате.',
    );
  }
}

function assertPauseIntervals(data: ActionSessionRehydrationData): void {
  let previousEnd = data.startedAt.getTime();

  for (const interval of data.pauseIntervals) {
    if (!(interval instanceof PauseInterval)) {
      throw new DomainError(
        'action_session.invalid_pause_interval',
        'Список пауз содержит некорректный интервал.',
      );
    }

    const startedAt = interval.startedAt.getTime();
    const endedAt = interval.endedAt.getTime();

    if (startedAt < data.startedAt.getTime() || startedAt < previousEnd) {
      throw new DomainError(
        'action_session.pause_intervals_overlap',
        'Интервалы пауз должны идти по порядку и не пересекаться.',
      );
    }

    previousEnd = endedAt;
  }

  if (data.pausedAt !== null && data.pausedAt.getTime() < data.startedAt.getTime()) {
    throw new DomainError(
      'action_session.time_before_start',
      'Пауза не может начаться раньше сессии.',
    );
  }

  if (data.completedAt !== null && data.completedAt.getTime() < data.startedAt.getTime()) {
    throw new DomainError(
      'action_session.time_before_start',
      'Сессия не может завершиться раньше начала.',
    );
  }

  if (data.pausedAt !== null && data.pausedAt.getTime() < previousEnd) {
    throw new DomainError(
      'action_session.paused_at_before_history',
      'Открытая пауза не может начинаться раньше завершённых интервалов.',
    );
  }

  if (data.completedAt !== null && data.completedAt.getTime() < previousEnd) {
    throw new DomainError(
      'action_session.completed_at_before_history',
      'Сессия не может завершиться раньше истории пауз.',
    );
  }
}

function assertSessionStatus(status: ActionSessionStatus): void {
  const allowedStatuses: readonly string[] = Object.values(ACTION_SESSION_STATUS);

  if (!allowedStatuses.includes(status)) {
    throw new DomainError('action_session.invalid_status', 'Неизвестное состояние сессии.');
  }
}

function assertCompletionKind(completionKind: SessionCompletionKind): void {
  const allowedKinds: readonly string[] = Object.values(SESSION_COMPLETION_KIND);

  if (!allowedKinds.includes(completionKind)) {
    throw new DomainError(
      'action_session.invalid_completion_kind',
      'Неизвестный вид завершения сессии.',
    );
  }
}

function assertOptionalCompletionKind(completionKind: SessionCompletionKind | null): void {
  if (completionKind !== null) {
    assertCompletionKind(completionKind);
  }
}

function assertOptionalResultNote(resultNote: SessionResultNote | null): void {
  if (resultNote !== null && !(resultNote instanceof SessionResultNote)) {
    throw new DomainError(
      'action_session.invalid_result_note',
      'Результат сессии должен быть корректной записью.',
    );
  }
}

function assertEntityId(value: EntityId, fieldName: string): void {
  if (!(value instanceof EntityId)) {
    throw new DomainError(
      'action_session.invalid_entity_id',
      `${fieldName} должен быть корректным идентификатором.`,
    );
  }
}

function assertOptionalDate(value: Date | null, fieldName: string): void {
  if (value !== null) {
    assertValidDate(value, fieldName);
  }
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError(
      'action_session.invalid_time',
      `${fieldName} содержит некорректное время.`,
    );
  }
}

function sumPauseDurations(pauseIntervals: readonly PauseInterval[]): number {
  return pauseIntervals.reduce(
    (totalDuration, interval) => totalDuration + interval.durationMilliseconds,
    0,
  );
}
