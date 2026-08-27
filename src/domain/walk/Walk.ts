import { DomainError } from '../../shared/errors/DomainError';
import type { DayDate } from '../day/DayDate';
import { PauseInterval } from '../action-session/PauseInterval';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import {
  copyWalkRoutineContext,
  isWalkLinkedEntity,
  isWalkReturnContext,
  WALK_LINKED_ENTITY_TYPE,
  type WalkLinkedEntity,
  type WalkReturnContext,
} from './WalkContext';
import { isWalkIntent, WALK_INTENT, type WalkIntent } from './WalkIntent';
import { isWalkImpact, type WalkImpact } from './WalkImpact';
import { isWalkMode, WALK_MODE, type WalkMode } from './WalkMode';
import { MAX_WALK_PHOTO_BYTES, type WalkPhoto } from './WalkPhoto';
import {
  copyWalkReentry,
  isWalkReentry,
  WALK_REENTRY_STATUS,
  type WalkReentry,
  type WalkReentryAction,
} from './WalkReentry';
import { isWalkStatus, WALK_STATUS, type WalkStatus } from './WalkStatus';
import { isWalkType, type WalkType } from './WalkType';
import { isWalkStateSnapshot, type WalkStateSnapshot } from './WalkStateSnapshot';
import {
  getWalkReflectionStages,
  isWalkReflectionStage,
  isWalkReflectionStageForTemplate,
  isWalkReflectionTemplate,
  type WalkReflectionStage,
  type WalkReflectionTemplate,
} from './WalkReflectionTemplate';

export const MAX_WALK_RESULT_LENGTH = 1000;

export interface WalkCreationData {
  readonly id: EntityId;
  readonly date: DayDate;
  readonly type: WalkType;
  readonly sphereId?: EntityId | null;
  readonly intent?: WalkIntent | null;
  readonly reflectionTemplate?: WalkReflectionTemplate | null;
  readonly beforeState?: WalkStateSnapshot | null;
  readonly linkedEntity?: WalkLinkedEntity | null;
  readonly returnContext?: WalkReturnContext | null;
  readonly now: Date;
}

export interface WalkRehydrationData {
  readonly id: EntityId;
  readonly date: DayDate;
  readonly type: WalkType;
  readonly sphereId?: EntityId | null;
  readonly intent?: WalkIntent | null;
  readonly reflectionTemplate?: WalkReflectionTemplate | null;
  readonly reflectionStage?: WalkReflectionStage | null;
  readonly beforeState?: WalkStateSnapshot | null;
  readonly afterState?: WalkStateSnapshot | null;
  readonly impact?: WalkImpact | null;
  readonly linkedEntity?: WalkLinkedEntity | null;
  readonly returnContext?: WalkReturnContext | null;
  readonly reentry?: WalkReentry | null;
  readonly status: WalkStatus;
  readonly mode: WalkMode | null;
  readonly startedAt: Date | null;
  readonly pausedAt?: Date | null;
  readonly pauseIntervals?: readonly PauseInterval[];
  readonly endedAt: Date | null;
  readonly timerTargetMinutes: number | null;
  readonly reflectionQuestion: string | null;
  readonly result: string | null;
  readonly photo: WalkPhoto | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface WalkStartData {
  readonly mode: WalkMode;
  readonly startedAt: Date;
  readonly timerTargetMinutes?: number;
  readonly reflectionQuestion: string;
}

export interface WalkCompletionData {
  readonly endedAt: Date;
  readonly result?: string;
  readonly photo?: WalkPhoto;
}

export interface WalkOutcomeData {
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection?: string;
  readonly reentryAction: WalkReentryAction;
  readonly updatedAt: Date;
}

export interface WalkPhotoUpdateData {
  readonly photo: WalkPhoto | null;
  readonly updatedAt: Date;
}

export class Walk extends Entity {
  public readonly date: DayDate;
  public readonly type: WalkType;
  public readonly sphereId: EntityId | null;
  public readonly intent: WalkIntent | null;
  public readonly reflectionTemplate: WalkReflectionTemplate | null;
  public readonly reflectionStage: WalkReflectionStage | null;
  public readonly beforeState: WalkStateSnapshot | null;
  public readonly afterState: WalkStateSnapshot | null;
  public readonly impact: WalkImpact | null;
  public readonly linkedEntity: WalkLinkedEntity | null;
  public readonly returnContext: WalkReturnContext | null;
  public readonly reentry: WalkReentry | null;
  public readonly status: WalkStatus;
  public readonly mode: WalkMode | null;
  public readonly startedAt: Date | null;
  public readonly pausedAt: Date | null;
  public readonly pauseIntervals: readonly PauseInterval[];
  public readonly endedAt: Date | null;
  public readonly timerTargetMinutes: number | null;
  public readonly reflectionQuestion: string | null;
  public readonly result: string | null;
  public readonly photo: WalkPhoto | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: WalkRehydrationData) {
    super(data.id);
    assertWalkInvariants(data);
    this.date = data.date;
    this.type = data.type;
    this.sphereId = data.sphereId ?? null;
    this.intent = data.intent ?? null;
    this.reflectionTemplate = data.reflectionTemplate ?? null;
    this.reflectionStage = data.reflectionStage ?? null;
    this.beforeState = copyOptionalState(data.beforeState ?? null);
    this.afterState = copyOptionalState(data.afterState ?? null);
    this.impact = data.impact ?? null;
    this.linkedEntity = copyOptionalLinkedEntity(data.linkedEntity ?? null);
    this.returnContext = copyOptionalReturnContext(data.returnContext ?? null);
    this.reentry = copyOptionalReentry(data.reentry ?? null);
    this.status = data.status;
    this.mode = data.mode;
    this.startedAt = copyOptionalDate(data.startedAt);
    this.pausedAt = copyOptionalDate(data.pausedAt ?? null);
    this.pauseIntervals = [...(data.pauseIntervals ?? [])];
    this.endedAt = copyOptionalDate(data.endedAt);
    this.timerTargetMinutes = data.timerTargetMinutes;
    this.reflectionQuestion = data.reflectionQuestion;
    this.result = data.result;
    this.photo = copyOptionalPhoto(data.photo);
    this.createdAt = new Date(data.createdAt.getTime());
    this.updatedAt = new Date(data.updatedAt.getTime());
    this.version = data.version;
  }

  public static create(data: WalkCreationData): Walk {
    assertWalkType(data.type);
    assertValidDate(data.now, 'walk.invalid_created_at');
    return new Walk({
      id: data.id,
      date: data.date,
      type: data.type,
      sphereId: data.sphereId ?? null,
      intent: data.intent ?? null,
      reflectionTemplate: data.reflectionTemplate ?? null,
      reflectionStage: null,
      beforeState: data.beforeState ?? null,
      afterState: null,
      impact: null,
      linkedEntity: data.linkedEntity ?? null,
      returnContext: data.returnContext ?? null,
      reentry: null,
      status: WALK_STATUS.planned,
      mode: null,
      startedAt: null,
      pausedAt: null,
      pauseIntervals: [],
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: null,
      result: null,
      photo: null,
      createdAt: data.now,
      updatedAt: data.now,
      version: 1,
    });
  }

  public static rehydrate(data: WalkRehydrationData): Walk {
    assertWalkType(data.type);
    assertValidDate(data.createdAt, 'walk.invalid_created_at');
    assertValidDate(data.updatedAt, 'walk.invalid_updated_at');
    if (!Number.isInteger(data.version) || data.version < 1) {
      throw new DomainError('walk.invalid_version', 'Версия прогулки указана неверно.');
    }
    return new Walk(data);
  }

  public start(data: WalkStartData): Walk {
    if (this.status === WALK_STATUS.running) return this;
    if (this.status !== WALK_STATUS.planned) {
      throw new DomainError(
        'walk.cannot_start_finished',
        'Завершённую прогулку нельзя начать повторно.',
      );
    }
    const reflectionStage =
      this.intent === WALK_INTENT.reflection && this.reflectionTemplate !== null
        ? (getWalkReflectionStages(this.reflectionTemplate)[0] ?? null)
        : null;
    return new Walk({
      ...this.toRehydrationData(),
      status: WALK_STATUS.running,
      mode: data.mode,
      startedAt: data.startedAt,
      timerTargetMinutes: data.timerTargetMinutes ?? null,
      reflectionQuestion: data.reflectionQuestion,
      reflectionStage,
      updatedAt: data.startedAt,
      version: this.version + 1,
    });
  }

  public pause(pausedAt: Date): Walk {
    if (this.status === WALK_STATUS.paused) return this;
    if (this.status !== WALK_STATUS.running) {
      throw new DomainError(
        'walk.cannot_pause',
        'Только идущую прогулку можно поставить на паузу.',
      );
    }
    assertValidDate(pausedAt, 'walk.invalid_paused_at');
    const previousActivityAt = this.pauseIntervals.at(-1)?.endedAt ?? this.startedAt!;
    if (pausedAt.getTime() < previousActivityAt.getTime()) {
      throw new DomainError(
        'walk.pause_before_activity',
        'Пауза не может начаться раньше предыдущего активного интервала.',
      );
    }
    return new Walk({
      ...this.toRehydrationData(),
      status: WALK_STATUS.paused,
      pausedAt,
      updatedAt: pausedAt,
      version: this.version + 1,
    });
  }

  public resume(resumedAt: Date): Walk {
    if (this.status === WALK_STATUS.running) return this;
    if (this.status !== WALK_STATUS.paused) {
      throw new DomainError('walk.cannot_resume', 'Только прогулку на паузе можно продолжить.');
    }
    assertValidDate(resumedAt, 'walk.invalid_resumed_at');
    const pauseInterval = PauseInterval.create(this.pausedAt!, resumedAt);
    return new Walk({
      ...this.toRehydrationData(),
      status: WALK_STATUS.running,
      pausedAt: null,
      pauseIntervals: [...this.pauseIntervals, pauseInterval],
      updatedAt: resumedAt,
      version: this.version + 1,
    });
  }

  public complete(data: WalkCompletionData): Walk {
    if (this.status !== WALK_STATUS.running && this.status !== WALK_STATUS.paused) {
      throw new DomainError('walk.cannot_complete', 'Только активную прогулку можно завершить.');
    }
    return this.finish(WALK_STATUS.completed, data.endedAt, data.result, data.photo ?? null);
  }

  public abandon(endedAt: Date): Walk {
    if (this.status !== WALK_STATUS.running && this.status !== WALK_STATUS.paused) {
      throw new DomainError('walk.cannot_abandon', 'Только активную прогулку можно прервать.');
    }
    return this.finish(WALK_STATUS.abandoned, endedAt, null, null);
  }

  public advanceReflectionStage(updatedAt: Date): Walk {
    this.assertReflectionGuidanceAvailable();
    assertValidDate(updatedAt, 'walk.invalid_updated_at');
    const stages = getWalkReflectionStages(this.reflectionTemplate!);
    const currentIndex = stages.indexOf(this.reflectionStage!);
    return new Walk({
      ...this.toRehydrationData(),
      reflectionStage: stages[currentIndex + 1] ?? null,
      updatedAt,
      version: this.version + 1,
    });
  }

  public disableReflectionGuidance(updatedAt: Date): Walk {
    if (this.status !== WALK_STATUS.running && this.status !== WALK_STATUS.paused) {
      throw new DomainError(
        'walk.reflection_requires_active',
        'Подсказки доступны только во время активной прогулки.',
      );
    }
    if (this.intent !== WALK_INTENT.reflection || this.reflectionTemplate === null) {
      throw new DomainError(
        'walk.reflection_guidance_unavailable',
        'Для этой прогулки подсказки недоступны.',
      );
    }
    if (this.reflectionStage === null) return this;
    assertValidDate(updatedAt, 'walk.invalid_updated_at');
    return new Walk({
      ...this.toRehydrationData(),
      reflectionStage: null,
      updatedAt,
      version: this.version + 1,
    });
  }

  public recordOutcome(data: WalkOutcomeData): Walk {
    if (this.status !== WALK_STATUS.completed) {
      throw new DomainError(
        'walk.outcome_requires_completed',
        'Итог можно сохранить только после завершения прогулки.',
      );
    }
    if (this.impact !== null) {
      throw new DomainError('walk.outcome_already_recorded', 'Итог прогулки уже сохранён.');
    }
    assertValidDate(data.updatedAt, 'walk.invalid_updated_at');
    if (data.updatedAt.getTime() < this.endedAt!.getTime()) {
      throw new DomainError(
        'walk.outcome_before_end',
        'Итог прогулки нельзя сохранить раньше её завершения.',
      );
    }
    return new Walk({
      ...this.toRehydrationData(),
      afterState: data.afterState,
      impact: data.impact,
      result: normalizeResult(data.reflection),
      reentry: {
        status: WALK_REENTRY_STATUS.pending,
        action: data.reentryAction,
        preparedAt: data.updatedAt,
        resolvedAt: null,
      },
      updatedAt: data.updatedAt,
      version: this.version + 1,
    });
  }

  public completeReentry(resolvedAt: Date): Walk {
    return this.resolveReentry(WALK_REENTRY_STATUS.completed, resolvedAt);
  }

  public closeReentry(resolvedAt: Date): Walk {
    return this.resolveReentry(WALK_REENTRY_STATUS.closedWithoutContinuation, resolvedAt);
  }

  public updatePhoto(data: WalkPhotoUpdateData): Walk {
    if (this.status !== WALK_STATUS.completed) {
      throw new DomainError(
        'walk.photo_requires_completed',
        'Фото можно прикрепить только к завершённой прогулке.',
      );
    }
    assertValidDate(data.updatedAt, 'walk.invalid_updated_at');
    if (data.updatedAt.getTime() < this.endedAt!.getTime()) {
      throw new DomainError(
        'walk.update_before_end',
        'Фото не может быть изменено до завершения прогулки.',
      );
    }
    assertOptionalPhoto(data.photo);
    return new Walk({
      ...this.toRehydrationData(),
      photo: data.photo,
      updatedAt: data.updatedAt,
      version: this.version + 1,
    });
  }

  public changeSphere(sphereId: EntityId | null, updatedAt: Date): Walk {
    if (sameOptionalEntityId(this.sphereId, sphereId)) return this;
    assertValidDate(updatedAt, 'walk.invalid_updated_at');
    return new Walk({
      ...this.toRehydrationData(),
      sphereId,
      updatedAt,
      version: this.version + 1,
    });
  }

  public get actualDurationMilliseconds(): number | null {
    if (this.startedAt === null || this.endedAt === null) return null;
    return this.elapsedDurationMilliseconds(this.endedAt);
  }

  public elapsedDurationMilliseconds(at: Date): number | null {
    if (this.startedAt === null) return null;
    assertValidDate(at, 'walk.invalid_elapsed_at');
    const referenceAt = this.endedAt ?? at;
    const lastSessionTimestamp =
      this.pausedAt ?? this.pauseIntervals.at(-1)?.endedAt ?? this.startedAt;
    if (referenceAt.getTime() < lastSessionTimestamp.getTime()) {
      throw new DomainError(
        'walk.elapsed_before_activity',
        'Нельзя вычислить длительность раньше последнего изменения прогулки.',
      );
    }
    const closedPauseDuration = this.pauseIntervals.reduce(
      (total, interval) => total + interval.durationMilliseconds,
      0,
    );
    const openPauseDuration =
      this.pausedAt === null ? 0 : referenceAt.getTime() - this.pausedAt.getTime();
    return (
      referenceAt.getTime() - this.startedAt.getTime() - closedPauseDuration - openPauseDuration
    );
  }

  private finish(
    status: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned,
    endedAt: Date,
    result: string | undefined | null,
    photo: WalkPhoto | null,
  ): Walk {
    assertValidDate(endedAt, 'walk.invalid_ended_at');
    if (endedAt.getTime() < this.startedAt!.getTime()) {
      throw new DomainError('walk.end_before_start', 'Прогулка не может завершиться до начала.');
    }
    const finalPauseInterval =
      this.pausedAt === null ? null : PauseInterval.create(this.pausedAt, endedAt);
    return new Walk({
      ...this.toRehydrationData(),
      status,
      pausedAt: null,
      pauseIntervals:
        finalPauseInterval === null
          ? this.pauseIntervals
          : [...this.pauseIntervals, finalPauseInterval],
      endedAt,
      result: normalizeResult(result),
      photo,
      updatedAt: endedAt,
      version: this.version + 1,
    });
  }

  private assertReflectionGuidanceAvailable(): void {
    if (this.status !== WALK_STATUS.running && this.status !== WALK_STATUS.paused) {
      throw new DomainError(
        'walk.reflection_requires_active',
        'Подсказки доступны только во время активной прогулки.',
      );
    }
    if (
      this.intent !== WALK_INTENT.reflection ||
      this.reflectionTemplate === null ||
      this.reflectionStage === null
    ) {
      throw new DomainError(
        'walk.reflection_guidance_unavailable',
        'Для этой прогулки подсказки недоступны.',
      );
    }
  }

  private resolveReentry(
    status:
      typeof WALK_REENTRY_STATUS.completed | typeof WALK_REENTRY_STATUS.closedWithoutContinuation,
    resolvedAt: Date,
  ): Walk {
    if (
      this.status !== WALK_STATUS.completed ||
      this.reentry === null ||
      this.reentry.status !== WALK_REENTRY_STATUS.pending
    ) {
      throw new DomainError('walk.reentry_not_pending', 'У прогулки нет ожидающего возвращения.');
    }
    assertValidDate(resolvedAt, 'walk.invalid_reentry_resolved_at');
    if (resolvedAt.getTime() < this.reentry.preparedAt.getTime()) {
      throw new DomainError(
        'walk.reentry_before_prepared',
        'Возвращение нельзя завершить раньше его подготовки.',
      );
    }
    return new Walk({
      ...this.toRehydrationData(),
      reentry: {
        ...this.reentry,
        status,
        resolvedAt,
      },
      updatedAt: resolvedAt,
      version: this.version + 1,
    });
  }

  private toRehydrationData(): WalkRehydrationData {
    return {
      id: this.id,
      date: this.date,
      type: this.type,
      sphereId: this.sphereId,
      intent: this.intent,
      reflectionTemplate: this.reflectionTemplate,
      reflectionStage: this.reflectionStage,
      beforeState: this.beforeState,
      afterState: this.afterState,
      impact: this.impact,
      linkedEntity: this.linkedEntity,
      returnContext: this.returnContext,
      reentry: this.reentry,
      status: this.status,
      mode: this.mode,
      startedAt: this.startedAt,
      pausedAt: this.pausedAt,
      pauseIntervals: this.pauseIntervals,
      endedAt: this.endedAt,
      timerTargetMinutes: this.timerTargetMinutes,
      reflectionQuestion: this.reflectionQuestion,
      result: this.result,
      photo: this.photo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    };
  }
}

function assertWalkInvariants(data: WalkRehydrationData): void {
  const pausedAt = data.pausedAt ?? null;
  const pauseIntervals = data.pauseIntervals ?? [];
  if (data.intent !== undefined && data.intent !== null && !isWalkIntent(data.intent)) {
    throw new DomainError('walk.invalid_intent', 'Режим прогулки указан неверно.');
  }
  const reflectionTemplate = data.reflectionTemplate ?? null;
  const reflectionStage = data.reflectionStage ?? null;
  if (
    (reflectionTemplate !== null && !isWalkReflectionTemplate(reflectionTemplate)) ||
    (reflectionTemplate !== null && data.intent !== WALK_INTENT.reflection)
  ) {
    throw new DomainError('walk.invalid_reflection_template', 'Шаблон размышления указан неверно.');
  }
  if (
    (reflectionStage !== null && !isWalkReflectionStage(reflectionStage)) ||
    (reflectionStage !== null &&
      (reflectionTemplate === null ||
        !isWalkReflectionStageForTemplate(reflectionTemplate, reflectionStage)))
  ) {
    throw new DomainError('walk.invalid_reflection_stage', 'Этап размышления указан неверно.');
  }
  if (
    data.beforeState !== undefined &&
    data.beforeState !== null &&
    !isWalkStateSnapshot(data.beforeState)
  ) {
    throw new DomainError('walk.invalid_before_state', 'Состояние до прогулки указано неверно.');
  }
  if (
    data.afterState !== undefined &&
    data.afterState !== null &&
    !isWalkStateSnapshot(data.afterState)
  ) {
    throw new DomainError('walk.invalid_after_state', 'Состояние после прогулки указано неверно.');
  }
  if (data.impact !== undefined && data.impact !== null && !isWalkImpact(data.impact)) {
    throw new DomainError('walk.invalid_impact', 'Влияние прогулки указано неверно.');
  }
  if (
    data.linkedEntity !== undefined &&
    data.linkedEntity !== null &&
    !isWalkLinkedEntity(data.linkedEntity)
  ) {
    throw new DomainError('walk.invalid_linked_entity', 'Связанная сущность указана неверно.');
  }
  if (
    data.returnContext !== undefined &&
    data.returnContext !== null &&
    !isWalkReturnContext(data.returnContext)
  ) {
    throw new DomainError('walk.invalid_return_context', 'Контекст возвращения указан неверно.');
  }
  const routineContext = data.returnContext?.routineContext ?? null;
  if (
    routineContext !== null &&
    (!routineContext.source.effectiveDate.equals(data.date) ||
      data.linkedEntity === undefined ||
      data.linkedEntity === null ||
      data.linkedEntity.type !== WALK_LINKED_ENTITY_TYPE.routine ||
      !data.linkedEntity.id.equals(routineContext.source.routineBlockId))
  ) {
    throw new DomainError('walk.invalid_return_context', 'Контекст возвращения указан неверно.');
  }
  const reentry = data.reentry ?? null;
  if (reentry !== null && !isWalkReentry(reentry)) {
    throw new DomainError('walk.invalid_reentry', 'Возвращение после прогулки указано неверно.');
  }
  if (!isWalkStatus(data.status)) {
    throw new DomainError('walk.invalid_status', 'Состояние прогулки указано неверно.');
  }
  if (
    reentry !== null &&
    (data.status !== WALK_STATUS.completed || data.impact === undefined || data.impact === null)
  ) {
    throw new DomainError('walk.invalid_reentry', 'Возвращение после прогулки указано неверно.');
  }
  if (data.status === WALK_STATUS.planned) {
    if (
      data.mode !== null ||
      data.startedAt !== null ||
      pausedAt !== null ||
      pauseIntervals.length > 0 ||
      data.endedAt !== null ||
      data.timerTargetMinutes !== null ||
      data.reflectionQuestion !== null ||
      data.result !== null ||
      data.photo !== null
    ) {
      throw new DomainError(
        'walk.invalid_planned_state',
        'Запланированная прогулка не должна содержать данные запуска или завершения.',
      );
    }
    return;
  }

  if (!isWalkMode(data.mode) || data.startedAt === null) {
    throw new DomainError('walk.invalid_running_state', 'Данные запуска прогулки неполны.');
  }
  assertValidDate(data.startedAt, 'walk.invalid_started_at');
  if (data.startedAt.getTime() < data.createdAt.getTime()) {
    throw new DomainError('walk.start_before_creation', 'Прогулка не может начаться до создания.');
  }
  assertPauseIntervals(pauseIntervals, data.startedAt);
  const question = data.reflectionQuestion?.trim() ?? '';
  if (question.length === 0 || question.length > 500) {
    throw new DomainError(
      'walk.invalid_reflection_question',
      'Вопрос для прогулки указан неверно.',
    );
  }
  if (data.mode === WALK_MODE.stopwatch && data.timerTargetMinutes !== null) {
    throw new DomainError('walk.stopwatch_has_target', 'Для секундомера длительность не задаётся.');
  }
  if (
    data.mode === WALK_MODE.timer &&
    (!Number.isInteger(data.timerTargetMinutes) ||
      data.timerTargetMinutes === null ||
      data.timerTargetMinutes < 1 ||
      data.timerTargetMinutes > 1440)
  ) {
    throw new DomainError(
      'walk.invalid_timer_target',
      'Длительность прогулки должна быть целым числом от 1 до 1440 минут.',
    );
  }

  if (data.status === WALK_STATUS.running) {
    if (pausedAt !== null || data.endedAt !== null || data.result !== null || data.photo !== null) {
      throw new DomainError(
        'walk.invalid_running_result',
        'Идущая прогулка не должна содержать итог завершения.',
      );
    }
    return;
  }

  if (data.status === WALK_STATUS.paused) {
    if (pausedAt === null || data.endedAt !== null || data.result !== null || data.photo !== null) {
      throw new DomainError(
        'walk.invalid_paused_state',
        'Пауза прогулки должна содержать время паузы без данных завершения.',
      );
    }
    assertValidDate(pausedAt, 'walk.invalid_paused_at');
    const previousActivityAt = pauseIntervals.at(-1)?.endedAt ?? data.startedAt;
    if (pausedAt.getTime() < previousActivityAt.getTime()) {
      throw new DomainError(
        'walk.pause_before_activity',
        'Пауза не может начаться раньше предыдущего активного интервала.',
      );
    }
    return;
  }

  if (pausedAt !== null) {
    throw new DomainError(
      'walk.finished_has_open_pause',
      'Завершённая прогулка не должна содержать открытую паузу.',
    );
  }

  if (data.endedAt === null) {
    throw new DomainError(
      'walk.missing_ended_at',
      'У завершённой прогулки должно быть время завершения.',
    );
  }
  assertValidDate(data.endedAt, 'walk.invalid_ended_at');
  if (data.endedAt.getTime() < data.startedAt.getTime()) {
    throw new DomainError('walk.end_before_start', 'Прогулка не может завершиться до начала.');
  }
  const lastPauseEndedAt = pauseIntervals.at(-1)?.endedAt;
  if (lastPauseEndedAt !== undefined && lastPauseEndedAt.getTime() > data.endedAt.getTime()) {
    throw new DomainError(
      'walk.pause_after_end',
      'Интервал паузы не может завершиться после прогулки.',
    );
  }
  if (data.status === WALK_STATUS.abandoned && (data.result !== null || data.photo !== null)) {
    throw new DomainError(
      'walk.abandoned_has_result',
      'Прерванная прогулка не должна содержать итог.',
    );
  }
  if (reentry !== null) {
    if (
      reentry.preparedAt.getTime() < data.endedAt.getTime() ||
      reentry.preparedAt.getTime() > data.updatedAt.getTime() ||
      (reentry.resolvedAt !== null && reentry.resolvedAt.getTime() > data.updatedAt.getTime())
    ) {
      throw new DomainError('walk.invalid_reentry', 'Возвращение после прогулки указано неверно.');
    }
  }
  normalizeResult(data.result);
  assertOptionalPhoto(data.photo);
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function normalizeResult(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_WALK_RESULT_LENGTH) {
    throw new DomainError(
      'walk.result_too_long',
      `Итог прогулки не должен превышать ${MAX_WALK_RESULT_LENGTH} символов.`,
    );
  }
  return normalized;
}

function assertOptionalPhoto(photo: WalkPhoto | null): void {
  if (photo === null) return;
  const prefix = `data:${photo.mimeType};base64,`;
  if (!photo.mimeType.startsWith('image/') || !photo.dataUrl.startsWith(prefix)) {
    throw new DomainError('walk.invalid_photo_type', 'Можно прикрепить только изображение.');
  }
  const encoded = photo.dataUrl.slice(prefix.length);
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedSize = (encoded.length * 3) / 4 - padding;
  if (
    !Number.isInteger(photo.sizeBytes) ||
    photo.sizeBytes < 1 ||
    photo.sizeBytes > MAX_WALK_PHOTO_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    encoded.length % 4 !== 0 ||
    decodedSize !== photo.sizeBytes
  ) {
    throw new DomainError(
      'walk.invalid_photo_size',
      `Размер фото не должен превышать ${MAX_WALK_PHOTO_BYTES / 1024 / 1024} МБ.`,
    );
  }
}

function assertWalkType(value: unknown): asserts value is WalkType {
  if (!isWalkType(value)) {
    throw new DomainError('walk.invalid_type', 'Тип прогулки указан неверно.');
  }
}

function assertValidDate(value: Date, code: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new DomainError(code, 'Дата и время прогулки указаны неверно.');
  }
}

function copyOptionalDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value.getTime());
}

function copyOptionalPhoto(photo: WalkPhoto | null): WalkPhoto | null {
  return photo === null ? null : { ...photo };
}

function copyOptionalState(state: WalkStateSnapshot | null): WalkStateSnapshot | null {
  return state === null ? null : { ...state };
}

function copyOptionalLinkedEntity(entity: WalkLinkedEntity | null): WalkLinkedEntity | null {
  return entity === null
    ? null
    : {
        type: entity.type,
        id: EntityId.create(entity.id.toString()),
      };
}

function copyOptionalReturnContext(context: WalkReturnContext | null): WalkReturnContext | null {
  return context === null
    ? null
    : {
        origin: context.origin,
        entity: copyOptionalLinkedEntity(context.entity),
        nextStep: context.nextStep,
        routineContext:
          context.routineContext === undefined || context.routineContext === null
            ? null
            : copyWalkRoutineContext(context.routineContext),
      };
}

function copyOptionalReentry(reentry: WalkReentry | null): WalkReentry | null {
  return reentry === null ? null : copyWalkReentry(reentry);
}

function assertPauseIntervals(pauseIntervals: readonly PauseInterval[], startedAt: Date): void {
  let previousEndedAt = startedAt;
  for (const interval of pauseIntervals) {
    if (!(interval instanceof PauseInterval)) {
      throw new DomainError(
        'walk.invalid_pause_interval',
        'Интервалы паузы прогулки указаны неверно.',
      );
    }
    if (interval.startedAt.getTime() < previousEndedAt.getTime()) {
      throw new DomainError(
        'walk.overlapping_pause_intervals',
        'Интервалы паузы прогулки пересекаются или нарушают порядок.',
      );
    }
    previousEndedAt = interval.endedAt;
  }
}
