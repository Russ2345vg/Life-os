import { DomainError } from '../../shared/errors/DomainError';
import type { DayDate } from '../day/DayDate';
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
import { isMorningStageStatus, type MorningStageState } from './MorningStageState';

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
  readonly shortenedMode: boolean;
  readonly stageStates: ReadonlyArray<MorningStageState>;
  readonly waterCompletedAt: Date | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: MorningPhysicalStatus;
  readonly physicalUpdatedAt: Date | null;
  readonly updatedAt: Date;
  readonly version: number;
}

export class MorningCycle extends Entity {
  readonly #dayId: EntityId;
  readonly #dateKey: DayDate;
  #state: MorningCycleState;
  #startedAt: Date | null;
  #finishedAt: Date | null;
  readonly #shortenedMode: boolean;
  #stageStates: ReadonlyArray<MorningStageState>;
  #waterCompletedAt: Date | null;
  #waterAmountMl: number | null;
  #physicalStatus: MorningPhysicalStatus;
  #physicalUpdatedAt: Date | null;
  #updatedAt: Date;
  #version: number;

  private constructor(data: MorningCycleRehydrationData) {
    super(data.id);
    this.#dayId = data.dayId;
    this.#dateKey = data.dateKey;
    this.#state = data.state;
    this.#startedAt = copyOptionalDate(data.startedAt);
    this.#finishedAt = copyOptionalDate(data.finishedAt);
    this.#shortenedMode = data.shortenedMode;
    this.#stageStates = copyStageStates(data.stageStates);
    this.#waterCompletedAt = copyOptionalDate(data.waterCompletedAt);
    this.#waterAmountMl = data.waterAmountMl;
    this.#physicalStatus = data.physicalStatus;
    this.#physicalUpdatedAt = copyOptionalDate(data.physicalUpdatedAt);
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
      shortenedMode: false,
      stageStates: [],
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
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
    assertLifecycleState(data.state, data.startedAt, data.finishedAt);
    assertStageStates(data.stageStates);
    if (!isMorningPhysicalStatus(data.physicalStatus)) {
      throw new DomainError(
        'morning_cycle.invalid_physical_status',
        'Состояние физической активации указано неверно.',
      );
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

  public get shortenedMode(): boolean {
    return this.#shortenedMode;
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

  public markReadyToWork(occurredAt: Date): boolean {
    if (this.#state === MORNING_CYCLE_STATE.readyToWork) return false;
    if (this.#state !== MORNING_CYCLE_STATE.inProgress) throw invalidStateTransition();
    this.change(occurredAt);
    this.#state = MORNING_CYCLE_STATE.readyToWork;
    return true;
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

  public startPhysical(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.inProgress) return false;
    this.assertPhysicalNotTerminal();
    if (this.#physicalStatus !== MORNING_PHYSICAL_STATUS.ready) {
      throw invalidPhysicalTransition();
    }
    return this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public completePhysical(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.done) return false;
    this.assertPhysicalNotTerminal();
    if (
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.ready &&
      this.#physicalStatus !== MORNING_PHYSICAL_STATUS.inProgress
    ) {
      throw invalidPhysicalTransition();
    }
    return this.changePhysical(MORNING_PHYSICAL_STATUS.done, occurredAt);
  }

  public skipPhysical(occurredAt: Date): boolean {
    this.assertStarted();
    this.assertActive();
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.skipped) return false;
    this.assertPhysicalNotTerminal();
    return this.changePhysical(MORNING_PHYSICAL_STATUS.skipped, occurredAt);
  }

  private assertStarted(): void {
    if (this.#startedAt === null) {
      throw new DomainError('morning_cycle.not_started', 'Сначала начните утренний блок.');
    }
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

  private changePhysical(status: MorningPhysicalStatus, occurredAt: Date): boolean {
    this.change(occurredAt);
    this.#physicalStatus = status;
    this.#physicalUpdatedAt = copyDate(occurredAt);
    return true;
  }

  private change(occurredAt: Date): void {
    assertDate(occurredAt, 'Время изменения утреннего блока');
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
  }
}

function assertDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new DomainError('morning_cycle.invalid_time', `${label} указано неверно.`);
  }
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
