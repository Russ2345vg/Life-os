import { DomainError } from '../../shared/errors/DomainError';
import type { DayDate } from '../day/DayDate';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';

export const ROUTINE_EXECUTION_STATUS = {
  notStarted: 'notStarted',
  running: 'running',
  completed: 'completed',
  abandoned: 'abandoned',
} as const;

export type RoutineExecutionStatus =
  (typeof ROUTINE_EXECUTION_STATUS)[keyof typeof ROUTINE_EXECUTION_STATUS];

export interface RoutineOccurrenceExecutionRehydrationData {
  readonly id: EntityId;
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly actualStartedAt: Date | null;
  readonly actualEndedAt: Date | null;
  readonly status: RoutineExecutionStatus;
  readonly note: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface StartRoutineOccurrenceExecutionData {
  readonly id: EntityId;
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly occurredAt: Date;
  readonly note?: string;
}

export class RoutineOccurrenceExecution extends Entity {
  public readonly routineBlockId: EntityId;
  public readonly occurrenceDate: DayDate;
  public readonly actualStartedAt: Date | null;
  public readonly actualEndedAt: Date | null;
  public readonly status: RoutineExecutionStatus;
  public readonly note: string | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: RoutineOccurrenceExecutionRehydrationData) {
    super(data.id);
    assertExecutionInvariants(data);
    this.routineBlockId = data.routineBlockId;
    this.occurrenceDate = data.occurrenceDate;
    this.actualStartedAt = copyOptionalDate(data.actualStartedAt);
    this.actualEndedAt = copyOptionalDate(data.actualEndedAt);
    this.status = data.status;
    this.note = normalizeNote(data.note);
    this.createdAt = copyDate(data.createdAt);
    this.updatedAt = copyDate(data.updatedAt);
    this.version = data.version;
  }

  public static start(data: StartRoutineOccurrenceExecutionData): RoutineOccurrenceExecution {
    const occurredAt = copyDate(data.occurredAt);
    return new RoutineOccurrenceExecution({
      id: data.id,
      routineBlockId: data.routineBlockId,
      occurrenceDate: data.occurrenceDate,
      actualStartedAt: occurredAt,
      actualEndedAt: null,
      status: ROUTINE_EXECUTION_STATUS.running,
      note: data.note ?? null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      version: 1,
    });
  }

  public static rehydrate(
    data: RoutineOccurrenceExecutionRehydrationData,
  ): RoutineOccurrenceExecution {
    return new RoutineOccurrenceExecution(data);
  }

  public complete(occurredAt: Date): RoutineOccurrenceExecution {
    return this.finish(ROUTINE_EXECUTION_STATUS.completed, occurredAt);
  }

  public abandon(occurredAt: Date): RoutineOccurrenceExecution {
    return this.finish(ROUTINE_EXECUTION_STATUS.abandoned, occurredAt);
  }

  private finish(
    status: typeof ROUTINE_EXECUTION_STATUS.completed | typeof ROUTINE_EXECUTION_STATUS.abandoned,
    occurredAt: Date,
  ): RoutineOccurrenceExecution {
    if (this.status !== ROUTINE_EXECUTION_STATUS.running || this.actualStartedAt === null) {
      throw new DomainError(
        'routine_execution.not_running',
        'Завершить или прервать можно только выполняющийся блок распорядка.',
      );
    }
    if (occurredAt.getTime() < this.actualStartedAt.getTime()) {
      throw new DomainError(
        'routine_execution.end_before_start',
        'Фактическое окончание блока не может быть раньше его начала.',
      );
    }
    return new RoutineOccurrenceExecution({
      id: this.id,
      routineBlockId: this.routineBlockId,
      occurrenceDate: this.occurrenceDate,
      actualStartedAt: this.actualStartedAt,
      actualEndedAt: occurredAt,
      status,
      note: this.note,
      createdAt: this.createdAt,
      updatedAt: occurredAt,
      version: this.version + 1,
    });
  }
}

function assertExecutionInvariants(data: RoutineOccurrenceExecutionRehydrationData): void {
  if (!Object.values(ROUTINE_EXECUTION_STATUS).some((status) => status === data.status)) {
    throw new DomainError(
      'routine_execution.invalid_status',
      'Неизвестное состояние выполнения блока.',
    );
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new DomainError(
      'routine_execution.invalid_version',
      'Версия выполнения блока указана неверно.',
    );
  }
  if (data.status === ROUTINE_EXECUTION_STATUS.notStarted) {
    if (data.actualStartedAt !== null || data.actualEndedAt !== null) {
      throw new DomainError(
        'routine_execution.invalid_timestamps',
        'Неначатый блок не должен содержать фактические отметки времени.',
      );
    }
    return;
  }
  if (data.actualStartedAt === null) {
    throw new DomainError(
      'routine_execution.start_required',
      'Для выполнения блока требуется фактическое время начала.',
    );
  }
  copyDate(data.actualStartedAt);
  if (data.status === ROUTINE_EXECUTION_STATUS.running) {
    if (data.actualEndedAt !== null) {
      throw new DomainError(
        'routine_execution.invalid_timestamps',
        'Выполняющийся блок не должен содержать время окончания.',
      );
    }
    return;
  }
  if (
    data.actualEndedAt === null ||
    data.actualEndedAt.getTime() < data.actualStartedAt.getTime()
  ) {
    throw new DomainError(
      'routine_execution.invalid_timestamps',
      'Фактические отметки времени выполнения блока указаны неверно.',
    );
  }
}

function normalizeNote(value: string | null): string | null {
  if (value === null) return null;
  const note = value.trim();
  if (note.length > 2000) {
    throw new DomainError(
      'routine_execution.note_too_long',
      'Заметка не должна превышать 2000 символов.',
    );
  }
  return note.length === 0 ? null : note;
}
