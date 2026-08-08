import { DomainError } from '../../shared/errors/DomainError';
import type { DayDate } from '../day/DayDate';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';

export const ROUTINE_OCCURRENCE_OVERRIDE_TYPE = {
  delayed: 'delayed',
  skipped: 'skipped',
  rescheduled: 'rescheduled',
  shortened: 'shortened',
  replacementAction: 'replacementAction',
} as const;

export type RoutineOccurrenceOverrideType =
  (typeof ROUTINE_OCCURRENCE_OVERRIDE_TYPE)[keyof typeof ROUTINE_OCCURRENCE_OVERRIDE_TYPE];

export interface RoutineOccurrenceOverrideDetails {
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly type: RoutineOccurrenceOverrideType;
  readonly startTimeOverride?: string;
  readonly endTimeOverride?: string;
  readonly targetDate?: DayDate;
  readonly targetStartTime?: string;
  readonly replacementActionId?: EntityId;
}

export interface RoutineOccurrenceOverrideCreationData extends RoutineOccurrenceOverrideDetails {
  readonly id: EntityId;
  readonly now: Date;
}

export interface RoutineOccurrenceOverrideRehydrationData extends RoutineOccurrenceOverrideDetails {
  readonly id: EntityId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class RoutineOccurrenceOverride extends Entity {
  public readonly routineBlockId: EntityId;
  public readonly occurrenceDate: DayDate;
  public readonly type: RoutineOccurrenceOverrideType;
  public readonly startTimeOverride: string | null;
  public readonly endTimeOverride: string | null;
  public readonly targetDate: DayDate | null;
  public readonly targetStartTime: string | null;
  public readonly replacementActionId: EntityId | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: RoutineOccurrenceOverrideRehydrationData) {
    super(data.id);
    const details = validateDetails(data);
    this.routineBlockId = details.routineBlockId;
    this.occurrenceDate = details.occurrenceDate;
    this.type = details.type;
    this.startTimeOverride = details.startTimeOverride ?? null;
    this.endTimeOverride = details.endTimeOverride ?? null;
    this.targetDate = details.targetDate ?? null;
    this.targetStartTime = details.targetStartTime ?? null;
    this.replacementActionId = details.replacementActionId ?? null;
    this.createdAt = copyDate(data.createdAt, 'routine_occurrence_override.invalid_created_at');
    this.updatedAt = copyDate(data.updatedAt, 'routine_occurrence_override.invalid_updated_at');
    if (!Number.isInteger(data.version) || data.version < 1) {
      throw new DomainError(
        'routine_occurrence_override.invalid_version',
        'Версия отклонения указана неверно.',
      );
    }
    this.version = data.version;
  }

  public static create(data: RoutineOccurrenceOverrideCreationData): RoutineOccurrenceOverride {
    return new RoutineOccurrenceOverride({
      ...data,
      createdAt: data.now,
      updatedAt: data.now,
      version: 1,
    });
  }

  public static rehydrate(
    data: RoutineOccurrenceOverrideRehydrationData,
  ): RoutineOccurrenceOverride {
    return new RoutineOccurrenceOverride(data);
  }

  public replace(
    details: Omit<RoutineOccurrenceOverrideDetails, 'routineBlockId' | 'occurrenceDate'>,
    now: Date,
  ): RoutineOccurrenceOverride {
    return new RoutineOccurrenceOverride({
      id: this.id,
      routineBlockId: this.routineBlockId,
      occurrenceDate: this.occurrenceDate,
      ...details,
      createdAt: this.createdAt,
      updatedAt: now,
      version: this.version + 1,
    });
  }
}

function validateDetails(
  details: RoutineOccurrenceOverrideDetails,
): RoutineOccurrenceOverrideDetails {
  const values = {
    startTimeOverride: details.startTimeOverride,
    endTimeOverride: details.endTimeOverride,
    targetDate: details.targetDate,
    targetStartTime: details.targetStartTime,
    replacementActionId: details.replacementActionId,
  };

  switch (details.type) {
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed:
      assertTime(values.startTimeOverride, 'routine_occurrence_override.start_time_required');
      assertOnly(values, ['startTimeOverride']);
      break;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped:
      assertOnly(values, []);
      break;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled:
      if (values.targetDate === undefined) {
        throw new DomainError(
          'routine_occurrence_override.target_date_required',
          'Укажите новую дату переноса.',
        );
      }
      assertTime(values.targetStartTime, 'routine_occurrence_override.target_time_required');
      assertOnly(values, ['targetDate', 'targetStartTime']);
      break;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened:
      assertTime(values.endTimeOverride, 'routine_occurrence_override.end_time_required');
      assertOnly(values, ['endTimeOverride']);
      break;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction:
      if (values.replacementActionId === undefined) {
        throw new DomainError(
          'routine_occurrence_override.replacement_action_required',
          'Выберите действие для замены.',
        );
      }
      assertOnly(values, ['replacementActionId']);
      break;
  }

  return details;
}

function assertTime(value: string | undefined, code: string): asserts value is string {
  if (value === undefined || !TIME_PATTERN.test(value)) {
    throw new DomainError(code, 'Укажите корректное время.');
  }
}

function assertOnly(values: Readonly<Record<string, unknown>>, allowed: readonly string[]): void {
  const unexpected = Object.entries(values).some(
    ([key, value]) => value !== undefined && !allowed.includes(key),
  );
  if (unexpected) {
    throw new DomainError(
      'routine_occurrence_override.unexpected_fields',
      'Отклонение содержит несовместимые поля.',
    );
  }
}

function copyDate(value: Date, code: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError(code, 'Дата и время отклонения указаны неверно.');
  }
  return new Date(value.getTime());
}
