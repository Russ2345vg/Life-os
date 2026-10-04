import { DomainError } from '../../shared/errors/DomainError';
import type { DayDate } from '../day/DayDate';
import {
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_RECOMMENDATION_STATUS,
  MorningPhysicalExecution,
  adjustMorningPhysicalPlanItem,
  copyMorningPhysicalRecommendation,
  copyMorningPhysicalPlanItems,
  createDefaultMorningPhysicalPlanItem,
  type ExerciseMeasurementType,
  type MorningPhysicalPlanAdjustment,
  type MorningPhysicalPlanItem,
  type MorningPhysicalRecommendation,
  type MorningPhysicalSetActual,
} from '../morning-exercise';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import {
  MORNING_PHYSICAL_STATUS,
  isMorningPhysicalStatus,
  type MorningPhysicalStatus,
} from './MorningPhysicalStatus';
import {
  MORNING_CYCLE_STATE,
  isMorningCycleState,
  type MorningCycleState,
} from './MorningCycleState';
import {
  DEFAULT_MORNING_SHORTENED_CONFIGURATION,
  MORNING_SHORTENED_MODE_STATE,
  copyMorningShortenedConfiguration,
  isMorningShortenedModeState,
  type MorningShortenedConfiguration,
  type MorningShortenedModeState,
} from './MorningShortenedMode';
import {
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  isMorningStageStatus,
  type MorningStageState,
  type MorningStageStatus,
} from './MorningStageState';
import {
  copyMorningStartState,
  createMorningStartState,
  sameMorningStartState,
  type MorningStartState,
  type MorningStartStateInput,
} from './MorningStartState';

export interface MorningCycleCreationData {
  readonly id: EntityId;
  readonly dayId: EntityId;
  readonly dateKey: DayDate;
  readonly occurredAt: Date;
}

export interface MorningCycleRehydrationData {
  readonly id: EntityId;
  readonly dayId: EntityId;
  readonly dateKey: DayDate;
  readonly state: MorningCycleState;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly startState?: MorningStartState | null;
  readonly shortenedMode: boolean;
  readonly shortenedModeState?: MorningShortenedModeState;
  readonly shortenedConfiguration?: MorningShortenedConfiguration | null;
  readonly stageStates: ReadonlyArray<MorningStageState>;
  readonly waterCompletedAt: Date | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: MorningPhysicalStatus;
  readonly physicalUpdatedAt: Date | null;
  readonly physicalPlanItems?: ReadonlyArray<MorningPhysicalPlanItem>;
  readonly physicalExecution?: MorningPhysicalExecution | null;
  readonly physicalRecommendation?: MorningPhysicalRecommendation | null;
  readonly updatedAt: Date;
  readonly version: number;
}

export class MorningCycle extends Entity {
  readonly #dayId: EntityId;
  readonly #dateKey: DayDate;
  #state: MorningCycleState;
  #startedAt: Date | null;
  #finishedAt: Date | null;
  #startState: MorningStartState | null;
  #shortenedModeState: MorningShortenedModeState;
  #shortenedConfiguration: MorningShortenedConfiguration | null;
  #stageStates: ReadonlyArray<MorningStageState>;
  #waterCompletedAt: Date | null;
  #waterAmountMl: number | null;
  #physicalStatus: MorningPhysicalStatus;
  #physicalUpdatedAt: Date | null;
  #physicalPlanItems: ReadonlyArray<MorningPhysicalPlanItem>;
  #physicalExecution: MorningPhysicalExecution | null;
  #physicalRecommendation: MorningPhysicalRecommendation | null;
  #updatedAt: Date;
  #version: number;

  private constructor(data: MorningCycleRehydrationData) {
    super(data.id);
    this.#dayId = data.dayId;
    this.#dateKey = data.dateKey;
    this.#state = data.state;
    this.#startedAt = copyOptionalDate(data.startedAt);
    this.#finishedAt = copyOptionalDate(data.finishedAt);
    this.#startState =
      data.startState === undefined || data.startState === null
        ? null
        : copyMorningStartState(data.startState);
    this.#shortenedModeState =
      data.shortenedModeState ??
      (data.shortenedMode
        ? MORNING_SHORTENED_MODE_STATE.shortenedActive
        : MORNING_SHORTENED_MODE_STATE.normal);
    this.#shortenedConfiguration =
      data.shortenedConfiguration === undefined
        ? data.shortenedMode
          ? copyMorningShortenedConfiguration(DEFAULT_MORNING_SHORTENED_CONFIGURATION)
          : null
        : data.shortenedConfiguration === null
          ? null
          : copyMorningShortenedConfiguration(data.shortenedConfiguration);
    this.#stageStates = copyStageStates(data.stageStates);
    this.#waterCompletedAt = copyOptionalDate(data.waterCompletedAt);
    this.#waterAmountMl = data.waterAmountMl;
    this.#physicalStatus = data.physicalStatus;
    this.#physicalUpdatedAt = copyOptionalDate(data.physicalUpdatedAt);
    this.#physicalPlanItems = copyMorningPhysicalPlanItems(data.physicalPlanItems ?? []);
    this.#physicalExecution = data.physicalExecution?.copy() ?? null;
    this.#physicalRecommendation =
      data.physicalRecommendation === undefined || data.physicalRecommendation === null
        ? null
        : copyMorningPhysicalRecommendation(data.physicalRecommendation);
    this.#updatedAt = copyDate(data.updatedAt);
    this.#version = data.version;
  }

  public static create(data: MorningCycleCreationData): MorningCycle {
    assertDate(data.occurredAt, 'Время создания утреннего блока');
    return new MorningCycle({
      id: data.id,
      dayId: data.dayId,
      dateKey: data.dateKey,
      state: MORNING_CYCLE_STATE.notStarted,
      startedAt: null,
      finishedAt: null,
      startState: null,
      shortenedMode: false,
      shortenedModeState: MORNING_SHORTENED_MODE_STATE.normal,
      shortenedConfiguration: null,
      stageStates: [],
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      physicalPlanItems: [],
      physicalExecution: null,
      physicalRecommendation: null,
      updatedAt: data.occurredAt,
      version: 1,
    });
  }

  public static rehydrate(data: MorningCycleRehydrationData): MorningCycle {
    assertDate(data.updatedAt, 'Время изменения утреннего блока');
    if (!isMorningCycleState(data.state)) {
      throw new DomainError(
        'morning_cycle.invalid_state',
        'Состояние утреннего блока указано неверно.',
      );
    }
    if (typeof data.shortenedMode !== 'boolean') {
      throw new DomainError(
        'morning_cycle.invalid_shortened_mode',
        'Режим утреннего блока указан неверно.',
      );
    }
    const shortenedModeState =
      data.shortenedModeState ??
      (data.shortenedMode
        ? MORNING_SHORTENED_MODE_STATE.shortenedActive
        : MORNING_SHORTENED_MODE_STATE.normal);
    if (!isMorningShortenedModeState(shortenedModeState)) {
      throw new DomainError(
        'morning_cycle.invalid_shortened_mode',
        'Режим утреннего блока указан неверно.',
      );
    }
    if (
      data.shortenedMode !==
      (shortenedModeState === MORNING_SHORTENED_MODE_STATE.shortenedActive)
    ) {
      throw new DomainError(
        'morning_cycle.invalid_shortened_mode',
        'Состояния сокращённого режима противоречат друг другу.',
      );
    }
    const shortenedConfiguration =
      data.shortenedConfiguration === undefined
        ? data.shortenedMode
          ? DEFAULT_MORNING_SHORTENED_CONFIGURATION
          : null
        : data.shortenedConfiguration;
    if (shortenedConfiguration !== null) {
      copyMorningShortenedConfiguration(shortenedConfiguration);
    }
    if (
      shortenedModeState === MORNING_SHORTENED_MODE_STATE.shortenedActive &&
      shortenedConfiguration === null
    ) {
      throw new DomainError(
        'morning_cycle.invalid_shortened_configuration',
        'Для сокращённого утра нужны настройки.',
      );
    }
    if (
      shortenedModeState === MORNING_SHORTENED_MODE_STATE.normal &&
      shortenedConfiguration !== null
    ) {
      throw new DomainError(
        'morning_cycle.invalid_shortened_configuration',
        'Обычное утро не должно содержать настройки сокращения.',
      );
    }
    assertLifecycleState(data.state, data.startedAt, data.finishedAt);
    assertStageStates(data.stageStates);
    if (!isMorningPhysicalStatus(data.physicalStatus)) {
      throw new DomainError(
        'morning_cycle.invalid_physical_status',
        'Состояние физической активации указано неверно.',
      );
    }
    if (data.physicalUpdatedAt !== null) {
      assertDate(data.physicalUpdatedAt, 'Время изменения физической активации');
    }
    if (!Number.isInteger(data.version) || data.version < 1) {
      throw new DomainError('morning_cycle.invalid_version', 'Версия утреннего блока неверна.');
    }
    if (
      data.waterAmountMl !== null &&
      (!Number.isInteger(data.waterAmountMl) || data.waterAmountMl <= 0)
    ) {
      throw invalidWaterAmount();
    }
    if ((data.waterCompletedAt === null) !== (data.waterAmountMl === null)) {
      throw new DomainError(
        'morning_cycle.invalid_water_state',
        'Состояние воды утреннего блока некорректно.',
      );
    }
    const physicalPlanItems = copyMorningPhysicalPlanItems(data.physicalPlanItems ?? []);
    const physicalExecution = data.physicalExecution ?? null;
    assertPhysicalExecutionState(
      data.physicalStatus,
      physicalExecution,
      physicalPlanItems,
      data.physicalUpdatedAt,
      data.updatedAt,
    );
    if (data.physicalRecommendation !== undefined && data.physicalRecommendation !== null) {
      const recommendation = copyMorningPhysicalRecommendation(data.physicalRecommendation);
      if (
        data.physicalStatus !== MORNING_PHYSICAL_STATUS.done ||
        physicalExecution?.completedAt === null ||
        recommendation.createdAt.getTime() < (physicalExecution?.completedAt.getTime() ?? 0) ||
        recommendation.createdAt.getTime() > data.updatedAt.getTime() ||
        (recommendation.decidedAt !== null &&
          recommendation.decidedAt.getTime() > data.updatedAt.getTime())
      ) {
        throw new DomainError(
          'morning_physical_recommendation.invalid_data',
          'Предложение нагрузки указано неверно.',
        );
      }
    }
    assertMirrorStageState(
      data.stageStates,
      data.waterCompletedAt,
      data.physicalStatus,
      data.physicalUpdatedAt,
    );
    return new MorningCycle(data);
  }

  public get dayId(): EntityId {
    return this.#dayId;
  }

  public get dateKey(): DayDate {
    return this.#dateKey;
  }

  public get state(): MorningCycleState {
    return this.#state;
  }

  public get startedAt(): Date | null {
    return copyOptionalDate(this.#startedAt);
  }

  public get finishedAt(): Date | null {
    return copyOptionalDate(this.#finishedAt);
  }

  public get startState(): MorningStartState | null {
    return this.#startState === null ? null : copyMorningStartState(this.#startState);
  }

  public get shortenedMode(): boolean {
    return this.#shortenedModeState === MORNING_SHORTENED_MODE_STATE.shortenedActive;
  }

  public get shortenedModeState(): MorningShortenedModeState {
    return this.#shortenedModeState;
  }

  public get wasEverShortened(): boolean {
    return this.#shortenedModeState !== MORNING_SHORTENED_MODE_STATE.normal;
  }

  public get shortenedConfiguration(): MorningShortenedConfiguration | null {
    return this.#shortenedConfiguration === null
      ? null
      : copyMorningShortenedConfiguration(this.#shortenedConfiguration);
  }

  public get stageStates(): ReadonlyArray<MorningStageState> {
    return copyStageStates(this.#stageStates);
  }

  public get waterCompletedAt(): Date | null {
    return copyOptionalDate(this.#waterCompletedAt);
  }

  public get waterAmountMl(): number | null {
    return this.#waterAmountMl;
  }

  public get physicalStatus(): MorningPhysicalStatus {
    return this.#physicalStatus;
  }

  public get physicalUpdatedAt(): Date | null {
    return copyOptionalDate(this.#physicalUpdatedAt);
  }

  public get physicalPlanItems(): ReadonlyArray<MorningPhysicalPlanItem> {
    return copyMorningPhysicalPlanItems(this.#physicalPlanItems);
  }

  public get physicalExecution(): MorningPhysicalExecution | null {
    return this.#physicalExecution?.copy() ?? null;
  }

  public get physicalRecommendation(): MorningPhysicalRecommendation | null {
    return this.#physicalRecommendation === null
      ? null
      : copyMorningPhysicalRecommendation(this.#physicalRecommendation);
  }

  public get updatedAt(): Date {
    return copyDate(this.#updatedAt);
  }

  public get version(): number {
    return this.#version;
  }

  public start(occurredAt: Date): boolean {
    if (this.#state !== MORNING_CYCLE_STATE.notStarted) return false;
    this.change(occurredAt);
    this.#startedAt = copyDate(occurredAt);
    this.#state = MORNING_CYCLE_STATE.inProgress;
    return true;
  }

  public markReadyToWork(mainActionReady: boolean, occurredAt: Date): boolean {
    if (this.#state === MORNING_CYCLE_STATE.readyToWork) return false;
    if (this.#state !== MORNING_CYCLE_STATE.inProgress) throw invalidStateTransition();
    if (!this.isReadyToWork(mainActionReady)) return false;
    this.change(occurredAt);
    this.#state = MORNING_CYCLE_STATE.readyToWork;
    return true;
  }

  public recordStartState(input: MorningStartStateInput, occurredAt: Date): boolean {
    if (
      this.#state === MORNING_CYCLE_STATE.finished ||
      this.#state === MORNING_CYCLE_STATE.abandoned ||
      (this.#waterCompletedAt !== null &&
        this.#stageStates.some(
          (stage) =>
            stage.stageId === MORNING_STAGE_ID.coldShower &&
            (stage.status === MORNING_STAGE_STATUS.completed ||
              stage.status === MORNING_STAGE_STATUS.skipped),
        ))
    ) {
      throw new DomainError(
        'morning_cycle.start_state_locked',
        'Состояние перед стартом уже нельзя изменить.',
      );
    }
    const next = createMorningStartState(input, occurredAt);
    if (sameMorningStartState(this.#startState, next)) return false;
    this.change(occurredAt);
    this.#startState = next;
    return true;
  }

  public isReadyToWork(mainActionReady: boolean): boolean {
    const shower = this.#stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.coldShower);
    const showerResolved =
      shower?.status === MORNING_STAGE_STATUS.completed ||
      shower?.status === MORNING_STAGE_STATUS.skipped;
    const physicalResolved =
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.done ||
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.skipped;
    const mainActionSkipped = this.#stageStates.some(
      (stage) =>
        stage.stageId === MORNING_STAGE_ID.mainAction &&
        stage.status === MORNING_STAGE_STATUS.skipped,
    );
    return (
      this.#startedAt !== null &&
      this.#waterCompletedAt !== null &&
      showerResolved &&
      physicalResolved &&
      (mainActionReady || mainActionSkipped)
    );
  }

  public finish(occurredAt: Date): boolean {
    if (this.#state === MORNING_CYCLE_STATE.finished) return false;
    if (this.#state !== MORNING_CYCLE_STATE.readyToWork) throw invalidStateTransition();
    this.change(occurredAt);
    this.#state = MORNING_CYCLE_STATE.finished;
    this.#finishedAt = copyDate(occurredAt);
    return true;
  }

  public abandon(occurredAt: Date): boolean {
    if (this.#state === MORNING_CYCLE_STATE.abandoned) return false;
    if (!this.isActive()) throw invalidStateTransition();
    this.change(occurredAt);
    this.#state = MORNING_CYCLE_STATE.abandoned;
    this.#finishedAt = copyDate(occurredAt);
    return true;
  }

  public isActive(): boolean {
    return (
      this.#state === MORNING_CYCLE_STATE.inProgress ||
      this.#state === MORNING_CYCLE_STATE.readyToWork
    );
  }

  public completeWater(occurredAt: Date, amountMl: number): boolean {
    this.assertStarted();
    this.assertActive();
    if (this.#waterCompletedAt !== null) return false;
    if (!Number.isInteger(amountMl) || amountMl <= 0) throw invalidWaterAmount();
    this.change(occurredAt);
    this.#waterCompletedAt = copyDate(occurredAt);
    this.#waterAmountMl = amountMl;
    return true;
  }

  public shorten(occurredAt: Date): boolean {
    return this.activateShortened(DEFAULT_MORNING_SHORTENED_CONFIGURATION, occurredAt);
  }

  public activateShortened(
    configuration: MorningShortenedConfiguration,
    occurredAt: Date,
  ): boolean {
    this.assertStarted();
    this.assertActive();
    const safeConfiguration = copyMorningShortenedConfiguration(configuration);
    if (
      this.#shortenedModeState === MORNING_SHORTENED_MODE_STATE.shortenedActive &&
      sameShortenedConfiguration(this.#shortenedConfiguration, safeConfiguration)
    ) {
      return false;
    }
    this.change(occurredAt);
    this.#shortenedModeState = MORNING_SHORTENED_MODE_STATE.shortenedActive;
    this.#shortenedConfiguration = safeConfiguration;
    this.applyShortenedConfiguration(safeConfiguration, occurredAt);
    return true;
  }

  public revertShortened(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    if (this.#shortenedModeState !== MORNING_SHORTENED_MODE_STATE.shortenedActive) return false;
    this.change(occurredAt);
    if (this.#physicalExecution?.completedAt === null) {
      this.#physicalExecution.cancelPendingRemainingSetStrategy();
    }
    this.#shortenedModeState = MORNING_SHORTENED_MODE_STATE.revertedToNormal;
    return true;
  }

  public completeColdShower(occurredAt: Date): boolean {
    return this.resolveColdShower(MORNING_STAGE_STATUS.completed, occurredAt);
  }

  public skipColdShower(occurredAt: Date): boolean {
    return this.resolveColdShower(MORNING_STAGE_STATUS.skipped, occurredAt);
  }

  public preparePhysical(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.ready) return false;
    this.assertPhysicalNotTerminal();
    if (this.#physicalStatus !== MORNING_PHYSICAL_STATUS.notConfigured) {
      throw invalidPhysicalTransition();
    }
    return this.changePhysical(MORNING_PHYSICAL_STATUS.ready, occurredAt);
  }

  public startPhysicalExecution(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    if (
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.inProgress &&
      this.#physicalExecution !== null
    ) {
      return false;
    }
    this.assertPhysicalNotTerminal();
    if (
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.ready ||
      this.#physicalPlanItems.length === 0 ||
      this.#physicalExecution !== null
    ) {
      throw invalidPhysicalTransition();
    }
    this.assertPhysicalOccurredAt(occurredAt);
    this.#physicalExecution = MorningPhysicalExecution.start(this.#physicalPlanItems, occurredAt);
    return this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public recoverPhysicalExecution(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    this.assertPhysicalNotTerminal();
    if (
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.inProgress ||
      this.#physicalExecution !== null
    ) {
      throw invalidPhysicalTransition();
    }
    if (this.#physicalPlanItems.length === 0) {
      throw new DomainError(
        'morning_cycle.physical_execution_unrecoverable',
        'Выполнение физической активации нельзя безопасно восстановить.',
      );
    }
    const executionStartedAt = this.#physicalUpdatedAt ?? this.#updatedAt;
    this.assertPhysicalOccurredAt(occurredAt, executionStartedAt);
    this.#physicalExecution = MorningPhysicalExecution.start(
      this.#physicalPlanItems,
      executionStartedAt,
    );
    return this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public pausePhysicalExecution(occurredAt: Date): boolean {
    const execution = this.requirePhysicalExecution();
    if (execution.pausedAt !== null) return false;
    this.assertPhysicalOccurredAt(occurredAt);
    execution.pause(occurredAt);
    return this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public resumePhysicalExecution(occurredAt: Date): boolean {
    const execution = this.requirePhysicalExecution();
    if (execution.pausedAt === null) return false;
    this.assertPhysicalOccurredAt(occurredAt);
    execution.resume(occurredAt);
    return this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public completePhysicalSet(
    exerciseDefinitionId: EntityId,
    setNumber: number,
    actual: MorningPhysicalSetActual,
    occurredAt: Date,
  ): void {
    const execution = this.requirePhysicalExecution();
    this.assertPhysicalOccurredAt(occurredAt);
    execution.completeSet(exerciseDefinitionId, setNumber, actual, occurredAt);
    this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public skipPhysicalSet(
    exerciseDefinitionId: EntityId,
    setNumber: number,
    occurredAt: Date,
  ): void {
    const execution = this.requirePhysicalExecution();
    this.assertPhysicalOccurredAt(occurredAt);
    execution.skipSet(exerciseDefinitionId, setNumber, occurredAt);
    this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public advancePhysicalExecution(occurredAt: Date): void {
    const execution = this.requirePhysicalExecution();
    this.assertPhysicalOccurredAt(occurredAt);
    execution.advance();
    this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public completePhysicalExecution(occurredAt: Date): boolean {
    if (
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.done &&
      this.#physicalExecution?.completedAt !== null
    ) {
      return false;
    }
    const execution = this.requirePhysicalExecution();
    this.assertPhysicalOccurredAt(occurredAt);
    if (!execution.complete(occurredAt)) return false;
    return this.changePhysical(MORNING_PHYSICAL_STATUS.done, occurredAt);
  }

  public proposePhysicalRecommendation(
    planItems: readonly MorningPhysicalPlanItem[],
    occurredAt: Date,
  ): boolean {
    if (
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.done ||
      this.#physicalExecution?.completedAt === null
    ) {
      throw new DomainError(
        'morning_physical_recommendation.execution_incomplete',
        'Сначала завершите зарядку.',
      );
    }
    if (this.#physicalRecommendation !== null) return false;
    const recommendation = copyMorningPhysicalRecommendation({
      status: MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending,
      planItems,
      createdAt: occurredAt,
      decidedAt: null,
    });
    this.change(occurredAt);
    this.#physicalRecommendation = recommendation;
    return true;
  }

  public acceptPhysicalRecommendation(occurredAt: Date): boolean {
    return this.resolvePhysicalRecommendation(
      MORNING_PHYSICAL_RECOMMENDATION_STATUS.accepted,
      occurredAt,
    );
  }

  public dismissPhysicalRecommendation(occurredAt: Date): boolean {
    return this.resolvePhysicalRecommendation(
      MORNING_PHYSICAL_RECOMMENDATION_STATUS.dismissed,
      occurredAt,
    );
  }

  public completeMirror(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    const existing = this.#stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror);
    if (existing?.status === MORNING_STAGE_STATUS.completed) return false;
    if (existing?.status === MORNING_STAGE_STATUS.skipped) {
      throw new DomainError(
        'morning_cycle.mirror_resolved',
        'Настрой перед зеркалом уже отмечен для этого утра.',
      );
    }
    this.assertMirrorReady();
    this.assertMirrorOccurredAt(occurredAt);
    this.change(occurredAt);
    this.#stageStates = [
      ...this.#stageStates.filter((stage) => stage.stageId !== MORNING_STAGE_ID.mirror),
      {
        stageId: MORNING_STAGE_ID.mirror,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: copyDate(occurredAt),
      },
    ];
    return true;
  }

  public skipMainAction(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    const existing = this.#stageStates.find(
      (stage) => stage.stageId === MORNING_STAGE_ID.mainAction,
    );
    if (existing?.status === MORNING_STAGE_STATUS.skipped) return false;
    this.change(occurredAt);
    const nextStage = {
      stageId: MORNING_STAGE_ID.mainAction,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: copyDate(occurredAt),
    } as const;
    this.#stageStates = existing
      ? this.#stageStates.map((stage) =>
          stage.stageId === MORNING_STAGE_ID.mainAction ? nextStage : stage,
        )
      : [...this.#stageStates, nextStage];
    return true;
  }

  public skipPhysical(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.skipped) return false;
    this.assertPhysicalNotTerminal();
    if (
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.inProgress ||
      this.#physicalExecution !== null
    ) {
      throw physicalPlanLocked();
    }
    return this.changePhysical(MORNING_PHYSICAL_STATUS.skipped, occurredAt);
  }

  public selectPhysicalExercise(
    definitionId: EntityId,
    measurementType: ExerciseMeasurementType,
    occurredAt: Date,
  ): boolean {
    this.assertPhysicalPlanEditable();
    if (this.#physicalPlanItems.some((item) => item.exerciseDefinitionId.equals(definitionId))) {
      return false;
    }
    const nextItems = [
      ...this.#physicalPlanItems,
      createDefaultMorningPhysicalPlanItem(definitionId, measurementType),
    ];
    this.changePhysicalPlan(nextItems, MORNING_PHYSICAL_STATUS.ready, occurredAt);
    return true;
  }

  public deselectPhysicalExercise(definitionId: EntityId, occurredAt: Date): boolean {
    this.assertPhysicalPlanEditable();
    const nextItems = this.#physicalPlanItems.filter(
      (item) => !item.exerciseDefinitionId.equals(definitionId),
    );
    if (nextItems.length === this.#physicalPlanItems.length) return false;
    this.changePhysicalPlan(
      nextItems,
      nextItems.length === 0
        ? MORNING_PHYSICAL_STATUS.notConfigured
        : MORNING_PHYSICAL_STATUS.ready,
      occurredAt,
    );
    return true;
  }

  public adjustPhysicalExercise(
    definitionId: EntityId,
    adjustment: MorningPhysicalPlanAdjustment,
    occurredAt: Date,
  ): boolean {
    this.assertPhysicalPlanEditable();
    const index = this.#physicalPlanItems.findIndex((item) =>
      item.exerciseDefinitionId.equals(definitionId),
    );
    if (index < 0) {
      throw new DomainError(
        'morning_cycle.physical_exercise_not_selected',
        'Упражнение не выбрано для этого утра.',
      );
    }
    const current = this.#physicalPlanItems[index]!;
    const adjusted = adjustMorningPhysicalPlanItem(current, adjustment);
    if (samePlanItem(current, adjusted)) return false;
    const nextItems = this.#physicalPlanItems.map((item, itemIndex) =>
      itemIndex === index ? adjusted : item,
    );
    this.changePhysicalPlan(nextItems, MORNING_PHYSICAL_STATUS.ready, occurredAt);
    return true;
  }

  private assertStarted(): void {
    if (this.#startedAt === null) {
      throw new DomainError('morning_cycle.not_started', 'Сначала начните утренний блок.');
    }
  }

  private resolvePhysicalRecommendation(
    status:
      | typeof MORNING_PHYSICAL_RECOMMENDATION_STATUS.accepted
      | typeof MORNING_PHYSICAL_RECOMMENDATION_STATUS.dismissed,
    occurredAt: Date,
  ): boolean {
    if (this.#physicalRecommendation === null) {
      throw new DomainError(
        'morning_physical_recommendation.missing',
        'Предложение нагрузки не найдено.',
      );
    }
    if (this.#physicalRecommendation.status === status) return false;
    if (this.#physicalRecommendation.status !== MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending) {
      throw new DomainError(
        'morning_physical_recommendation.locked',
        'Решение по нагрузке уже сохранено.',
      );
    }
    this.change(occurredAt);
    this.#physicalRecommendation = {
      ...this.#physicalRecommendation,
      status,
      decidedAt: new Date(occurredAt.getTime()),
    };
    return true;
  }

  private assertActive(): void {
    if (!this.isActive()) {
      throw new DomainError('morning_cycle.closed', 'Утренний блок уже закрыт.');
    }
  }

  private assertPhysicalNotTerminal(): void {
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.done) {
      throw new DomainError(
        'morning_cycle.physical_completed',
        'Физическая активация уже завершена.',
      );
    }
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.skipped) {
      throw new DomainError(
        'morning_cycle.physical_skipped',
        'Физическая активация уже пропущена.',
      );
    }
  }

  private assertPhysicalPlanEditable(): void {
    this.assertStarted();
    this.assertActive();
    if (
      this.#physicalExecution !== null ||
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.inProgress ||
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.done ||
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.skipped
    ) {
      throw physicalPlanLocked();
    }
  }

  private requirePhysicalExecution(): MorningPhysicalExecution {
    this.assertStarted();
    this.assertActive();
    if (
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.inProgress ||
      this.#physicalExecution === null
    ) {
      throw invalidPhysicalTransition();
    }
    return this.#physicalExecution;
  }

  private assertPhysicalOccurredAt(occurredAt: Date, earliestAt = this.#physicalUpdatedAt): void {
    assertDate(occurredAt, 'Время изменения физической активации');
    if (earliestAt !== null && occurredAt.getTime() < earliestAt.getTime()) {
      throw physicalTimeBeforeUpdate();
    }
  }

  private assertMirrorReady(): void {
    const shower = this.#stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.coldShower);
    const showerResolved =
      shower?.status === MORNING_STAGE_STATUS.completed ||
      shower?.status === MORNING_STAGE_STATUS.skipped;
    const physicalResolved =
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.done ||
      this.#physicalStatus === MORNING_PHYSICAL_STATUS.skipped;
    if (this.#waterCompletedAt === null || !showerResolved || !physicalResolved) {
      throw mirrorNotReady();
    }
  }

  private applyShortenedConfiguration(
    configuration: MorningShortenedConfiguration,
    occurredAt: Date,
  ): void {
    if (configuration.coldShower === 'skip') {
      const shower = this.#stageStates.find(
        (stage) => stage.stageId === MORNING_STAGE_ID.coldShower,
      );
      if (shower === undefined) {
        this.#stageStates = [
          ...this.#stageStates,
          {
            stageId: MORNING_STAGE_ID.coldShower,
            status: MORNING_STAGE_STATUS.skipped,
            updatedAt: copyDate(occurredAt),
          },
        ];
      }
    }

    if (this.#physicalExecution !== null && this.#physicalExecution.completedAt === null) {
      this.#physicalExecution.requestRemainingSetStrategy(configuration.physical);
    } else if (
      configuration.physical === 'skip' &&
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.done &&
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.skipped
    ) {
      this.#physicalStatus = MORNING_PHYSICAL_STATUS.skipped;
      this.#physicalUpdatedAt = copyDate(occurredAt);
    }

    if (configuration.mirror === 'skip') {
      const mirror = this.#stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror);
      if (mirror === undefined) {
        this.#stageStates = [
          ...this.#stageStates,
          {
            stageId: MORNING_STAGE_ID.mirror,
            status: MORNING_STAGE_STATUS.skipped,
            updatedAt: copyDate(occurredAt),
          },
        ];
      }
    }
  }

  private assertMirrorOccurredAt(occurredAt: Date): void {
    assertDate(occurredAt, 'Время настройки внимания');
    if (
      this.#physicalUpdatedAt !== null &&
      occurredAt.getTime() < this.#physicalUpdatedAt.getTime()
    ) {
      throw mirrorTimeBeforePhysical();
    }
  }

  private changePhysicalPlan(
    items: readonly MorningPhysicalPlanItem[],
    status: MorningPhysicalStatus,
    occurredAt: Date,
  ): void {
    this.change(occurredAt);
    this.#physicalPlanItems = copyMorningPhysicalPlanItems(items);
    this.#physicalStatus = status;
    this.#physicalUpdatedAt = copyDate(occurredAt);
  }

  private resolveColdShower(status: MorningStageStatus, occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    const existing = this.#stageStates.find(
      (stage) => stage.stageId === MORNING_STAGE_ID.coldShower,
    );
    if (existing?.status === status) return false;
    if (
      existing?.status === MORNING_STAGE_STATUS.completed ||
      existing?.status === MORNING_STAGE_STATUS.skipped
    ) {
      throw new DomainError(
        'morning_cycle.cold_shower_resolved',
        'Холодный душ уже отмечен для этого утра.',
      );
    }
    this.change(occurredAt);
    const nextStage = {
      stageId: MORNING_STAGE_ID.coldShower,
      status,
      updatedAt: copyDate(occurredAt),
    };
    this.#stageStates = existing
      ? this.#stageStates.map((stage) =>
          stage.stageId === MORNING_STAGE_ID.coldShower ? nextStage : stage,
        )
      : [...this.#stageStates, nextStage];
    return true;
  }

  private changePhysical(status: MorningPhysicalStatus, occurredAt: Date): boolean {
    this.change(occurredAt);
    this.#physicalStatus = status;
    this.#physicalUpdatedAt = copyDate(occurredAt);
    return true;
  }

  private change(occurredAt: Date): void {
    assertDate(occurredAt, 'Время изменения утреннего блока');
    if (
      this.#physicalExecution !== null &&
      this.#physicalUpdatedAt !== null &&
      occurredAt.getTime() < this.#physicalUpdatedAt.getTime()
    ) {
      throw physicalTimeBeforeUpdate();
    }
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
  }
}

function assertDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new DomainError('morning_cycle.invalid_time', `${label} указано неверно.`);
  }
}

function physicalTimeBeforeUpdate(): DomainError {
  return new DomainError(
    'morning_cycle.physical_time_before_update',
    'Время изменения не может быть раньше предыдущего действия физической активации.',
  );
}

function mirrorNotReady(): DomainError {
  return new DomainError(
    'morning_cycle.mirror_not_ready',
    'Сначала завершите быстрый старт и физическую активацию.',
  );
}

function mirrorTimeBeforePhysical(): DomainError {
  return new DomainError(
    'morning_cycle.mirror_time_before_physical',
    'Время настройки не может быть раньше завершения физической активации.',
  );
}

function assertLifecycleState(
  state: MorningCycleState,
  startedAt: Date | null,
  finishedAt: Date | null,
): void {
  if (startedAt !== null) assertDate(startedAt, 'Время запуска утреннего блока');
  if (finishedAt !== null) assertDate(finishedAt, 'Время закрытия утреннего блока');

  const isNotStarted = state === MORNING_CYCLE_STATE.notStarted;
  const isTerminal =
    state === MORNING_CYCLE_STATE.finished || state === MORNING_CYCLE_STATE.abandoned;
  const valid = isNotStarted
    ? startedAt === null && finishedAt === null
    : startedAt !== null && (isTerminal ? finishedAt !== null : finishedAt === null);

  if (!valid) {
    throw new DomainError(
      'morning_cycle.invalid_lifecycle',
      'Жизненный цикл утреннего блока некорректен.',
    );
  }
}

function assertStageStates(stageStates: ReadonlyArray<MorningStageState>): void {
  if (!Array.isArray(stageStates)) throw invalidStageStates();
  const stageIds = new Set<string>();
  for (const stage of stageStates) {
    if (
      typeof stage !== 'object' ||
      stage === null ||
      typeof stage.stageId !== 'string' ||
      stage.stageId.trim() === '' ||
      stage.stageId !== stage.stageId.trim() ||
      stageIds.has(stage.stageId) ||
      !isMorningStageStatus(stage.status)
    ) {
      throw invalidStageStates();
    }
    if (stage.updatedAt !== null) assertDate(stage.updatedAt, 'Время изменения этапа утра');
    stageIds.add(stage.stageId);
  }
}

function assertMirrorStageState(
  stageStates: ReadonlyArray<MorningStageState>,
  waterCompletedAt: Date | null,
  physicalStatus: MorningPhysicalStatus,
  physicalUpdatedAt: Date | null,
): void {
  const mirror = stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror);
  if (mirror === undefined) return;
  if (mirror.status === MORNING_STAGE_STATUS.skipped && mirror.updatedAt !== null) return;
  const shower = stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.coldShower);
  const showerResolved =
    shower?.status === MORNING_STAGE_STATUS.completed ||
    shower?.status === MORNING_STAGE_STATUS.skipped;
  const physicalResolved =
    physicalStatus === MORNING_PHYSICAL_STATUS.done ||
    physicalStatus === MORNING_PHYSICAL_STATUS.skipped;
  if (
    mirror.status !== MORNING_STAGE_STATUS.completed ||
    mirror.updatedAt === null ||
    waterCompletedAt === null ||
    !showerResolved ||
    !physicalResolved ||
    (physicalUpdatedAt !== null && mirror.updatedAt.getTime() < physicalUpdatedAt.getTime())
  ) {
    throw invalidStageStates();
  }
}

function copyStageStates(
  stageStates: ReadonlyArray<MorningStageState>,
): ReadonlyArray<MorningStageState> {
  return stageStates.map((stage) => ({
    stageId: stage.stageId,
    status: stage.status,
    updatedAt: copyOptionalDate(stage.updatedAt),
  }));
}

function invalidWaterAmount(): DomainError {
  return new DomainError('morning_cycle.invalid_water_amount', 'Объём воды указан неверно.');
}

function invalidPhysicalTransition(): DomainError {
  return new DomainError(
    'morning_cycle.invalid_physical_transition',
    'Переход физической активации недоступен.',
  );
}

function physicalPlanLocked(): DomainError {
  return new DomainError(
    'morning_cycle.physical_plan_locked',
    'План физической активации уже нельзя изменить.',
  );
}

function assertPhysicalExecutionState(
  status: MorningPhysicalStatus,
  execution: MorningPhysicalExecution | null,
  planItems: readonly MorningPhysicalPlanItem[],
  physicalUpdatedAt: Date | null,
  updatedAt: Date,
): void {
  if (execution === null) return;
  if (!(execution instanceof MorningPhysicalExecution)) throw invalidPhysicalExecutionState();

  const completed = execution.completedAt !== null;
  if (
    (completed && status !== MORNING_PHYSICAL_STATUS.done) ||
    (!completed && status !== MORNING_PHYSICAL_STATUS.inProgress)
  ) {
    throw invalidPhysicalExecutionState();
  }

  const detailedTimes = [
    execution.startedAt,
    execution.completedAt,
    execution.pausedAt,
    ...execution.pauseIntervals.flatMap((interval) => [interval.startedAt, interval.endedAt]),
    ...execution.sets.map((set) => set.resolvedAt),
  ].filter((value): value is Date => value !== null);
  const latestDetailedTime = detailedTimes.reduce((latest, value) =>
    value.getTime() > latest.getTime() ? value : latest,
  );
  if (
    physicalUpdatedAt === null ||
    physicalUpdatedAt.getTime() < latestDetailedTime.getTime() ||
    updatedAt.getTime() < physicalUpdatedAt.getTime() ||
    (completed && physicalUpdatedAt.getTime() !== execution.completedAt?.getTime())
  ) {
    throw invalidPhysicalExecutionState();
  }

  const expectedSets = planItems.flatMap((item) =>
    Array.from({ length: item.sets }, (_, index) => ({
      exerciseDefinitionId: item.exerciseDefinitionId,
      setNumber: index + 1,
      measurementType: item.measurementType,
    })),
  );
  const executionSets = execution.sets;
  if (
    expectedSets.length !== executionSets.length ||
    expectedSets.some((expected, index) => {
      const actual = executionSets[index];
      return (
        actual === undefined ||
        !actual.exerciseDefinitionId.equals(expected.exerciseDefinitionId) ||
        actual.setNumber !== expected.setNumber ||
        actual.measurementType !== expected.measurementType
      );
    })
  ) {
    throw invalidPhysicalExecutionState();
  }
}

function invalidPhysicalExecutionState(): DomainError {
  return new DomainError(
    'morning_cycle.invalid_physical_execution',
    'Состояние выполнения физической активации некорректно.',
  );
}

function invalidStateTransition(): DomainError {
  return new DomainError(
    'morning_cycle.invalid_state_transition',
    'Переход состояния утреннего блока недоступен.',
  );
}

function invalidStageStates(): DomainError {
  return new DomainError(
    'morning_cycle.invalid_stage_states',
    'Состояния этапов утреннего блока некорректны.',
  );
}

function samePlanItem(left: MorningPhysicalPlanItem, right: MorningPhysicalPlanItem): boolean {
  if (
    !left.exerciseDefinitionId.equals(right.exerciseDefinitionId) ||
    left.measurementType !== right.measurementType ||
    left.sets !== right.sets
  ) {
    return false;
  }
  return left.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions &&
    right.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? left.targetReps === right.targetReps
    : left.measurementType === EXERCISE_MEASUREMENT_TYPE.duration &&
        right.measurementType === EXERCISE_MEASUREMENT_TYPE.duration &&
        left.targetDurationSeconds === right.targetDurationSeconds;
}

function sameShortenedConfiguration(
  left: MorningShortenedConfiguration | null,
  right: MorningShortenedConfiguration,
): boolean {
  return (
    left !== null &&
    left.coldShower === right.coldShower &&
    left.physical === right.physical &&
    left.mirror === right.mirror
  );
}
