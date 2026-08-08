import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import type { DayDate } from '../day/DayDate';
import { isRoutineBlockCategory, type RoutineBlockCategory } from './RoutineBlockCategory';
import type { RoutineBlockRecurrence } from './RoutineBlockRecurrence';
import {
  ROUTINE_BLOCK_ASSIGNMENT,
  copyRoutineBlockAssignment,
  createRoutineBlockAssignment,
  type RoutineBlockAssignment,
} from './RoutineBlockAssignment';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface RoutineBlockDetails {
  readonly anchorDate: DayDate;
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly category: RoutineBlockCategory;
  readonly recurrence: RoutineBlockRecurrence;
  readonly required: boolean;
  readonly assignment?: RoutineBlockAssignment;
}

export interface RoutineBlockCreationData extends RoutineBlockDetails {
  readonly id: EntityId;
  readonly now: Date;
}

export interface RoutineBlockRehydrationData extends RoutineBlockDetails {
  readonly id: EntityId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export class RoutineBlock extends Entity {
  public readonly anchorDate: DayDate;
  public readonly title: string;
  public readonly startTime: string;
  public readonly endTime: string;
  public readonly category: RoutineBlockCategory;
  public readonly recurrence: RoutineBlockRecurrence;
  public readonly required: boolean;
  public readonly assignment: RoutineBlockAssignment;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: RoutineBlockRehydrationData) {
    super(data.id);
    this.anchorDate = data.anchorDate;
    this.title = data.title;
    this.startTime = data.startTime;
    this.endTime = data.endTime;
    this.category = data.category;
    this.recurrence = data.recurrence;
    this.required = data.required;
    this.assignment = copyRoutineBlockAssignment(
      data.assignment ?? createRoutineBlockAssignment(ROUTINE_BLOCK_ASSIGNMENT.reminder),
    );
    this.createdAt = new Date(data.createdAt.getTime());
    this.updatedAt = new Date(data.updatedAt.getTime());
    this.version = data.version;
  }

  public static create(data: RoutineBlockCreationData): RoutineBlock {
    const details = validateDetails(data);
    assertValidDate(data.now, 'routine_block.invalid_created_at');
    return new RoutineBlock({
      id: data.id,
      ...details,
      createdAt: data.now,
      updatedAt: data.now,
      version: 1,
    });
  }

  public static rehydrate(data: RoutineBlockRehydrationData): RoutineBlock {
    const details = validateDetails(data);
    assertValidDate(data.createdAt, 'routine_block.invalid_created_at');
    assertValidDate(data.updatedAt, 'routine_block.invalid_updated_at');
    if (!Number.isInteger(data.version) || data.version < 1) {
      throw new DomainError('routine_block.invalid_version', 'Версия блока указана неверно.');
    }
    return new RoutineBlock({ ...data, ...details });
  }

  public update(details: RoutineBlockDetails, now: Date): RoutineBlock {
    const validated = validateDetails(details);
    assertValidDate(now, 'routine_block.invalid_updated_at');
    return new RoutineBlock({
      id: this.id,
      ...validated,
      assignment: validated.assignment ?? this.assignment,
      createdAt: this.createdAt,
      updatedAt: now,
      version: this.version + 1,
    });
  }

  public occursOn(date: DayDate): boolean {
    return this.recurrence.occursOn(this.anchorDate, date);
  }
}

function validateDetails(details: RoutineBlockDetails): RoutineBlockDetails {
  const title = details.title.trim();
  if (title.length === 0) {
    throw new DomainError('routine_block.title_required', 'Введите название блока.');
  }
  if (!TIME_PATTERN.test(details.startTime)) {
    throw new DomainError('routine_block.start_time_required', 'Укажите корректное время начала.');
  }
  if (!TIME_PATTERN.test(details.endTime)) {
    throw new DomainError('routine_block.end_time_required', 'Укажите корректное время окончания.');
  }
  if (details.endTime <= details.startTime) {
    throw new DomainError(
      'routine_block.invalid_time_range',
      'Время окончания должно быть позже времени начала в пределах одного дня.',
    );
  }
  if (!isRoutineBlockCategory(details.category)) {
    throw new DomainError('routine_block.invalid_category', 'Категория блока указана неверно.');
  }
  return { ...details, title };
}

function assertValidDate(value: Date, code: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new DomainError(code, 'Дата и время блока указаны неверно.');
  }
}
