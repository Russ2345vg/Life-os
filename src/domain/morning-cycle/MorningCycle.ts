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
  readonly startedAt: Date | null;
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
  #startedAt: Date | null;
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
    this.#startedAt = copyOptionalDate(data.startedAt);
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
      startedAt: null,
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

  public get startedAt(): Date | null {
    return copyOptionalDate(this.#startedAt);
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
    if (this.#startedAt !== null) return false;
    this.change(occurredAt);
    this.#startedAt = copyDate(occurredAt);
    return true;
  }

  public completeWater(occurredAt: Date, amountMl: number): boolean {
    this.assertStarted();
    if (this.#waterCompletedAt !== null) return false;
    if (!Number.isInteger(amountMl) || amountMl <= 0) throw invalidWaterAmount();
    this.change(occurredAt);
    this.#waterCompletedAt = copyDate(occurredAt);
    this.#waterAmountMl = amountMl;
    return true;
  }

  public preparePhysical(occurredAt: Date): boolean {
    this.assertStarted();
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.ready) return false;
    this.assertPhysicalNotTerminal();
    if (this.#physicalStatus !== MORNING_PHYSICAL_STATUS.notConfigured) {
      throw invalidPhysicalTransition();
    }
    return this.changePhysical(MORNING_PHYSICAL_STATUS.ready, occurredAt);
  }

  public startPhysical(occurredAt: Date): boolean {
    this.assertStarted();
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.inProgress) return false;
    this.assertPhysicalNotTerminal();
    if (this.#physicalStatus !== MORNING_PHYSICAL_STATUS.ready) {
      throw invalidPhysicalTransition();
    }
    return this.changePhysical(MORNING_PHYSICAL_STATUS.inProgress, occurredAt);
  }

  public completePhysical(occurredAt: Date): boolean {
    this.assertStarted();
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
    if (this.#physicalStatus === MORNING_PHYSICAL_STATUS.skipped) return false;
    this.assertPhysicalNotTerminal();
    return this.changePhysical(MORNING_PHYSICAL_STATUS.skipped, occurredAt);
  }

  private assertStarted(): void {
    if (this.#startedAt === null) {
      throw new DomainError('morning_cycle.not_started', 'Сначала начните утренний блок.');
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

function invalidWaterAmount(): DomainError {
  return new DomainError('morning_cycle.invalid_water_amount', 'Объём воды указан неверно.');
}

function invalidPhysicalTransition(): DomainError {
  return new DomainError(
    'morning_cycle.invalid_physical_transition',
    'Переход физической активации недоступен.',
  );
}
