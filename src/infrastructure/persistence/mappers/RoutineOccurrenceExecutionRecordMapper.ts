import {
  ROUTINE_EXECUTION_STATUS,
  RoutineOccurrenceExecution,
  type RoutineExecutionStatus,
} from '../../../domain';
import type { RoutineOccurrenceExecutionRecord } from '../records/RoutineOccurrenceExecutionRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableString,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class RoutineOccurrenceExecutionRecordMapper {
  public static toRecord(execution: RoutineOccurrenceExecution): RoutineOccurrenceExecutionRecord {
    return {
      schemaVersion: 1,
      id: execution.id.toString(),
      routineBlockId: execution.routineBlockId.toString(),
      occurrenceDate: execution.occurrenceDate.toString(),
      occurrenceKey: routineExecutionOccurrenceKey(
        execution.routineBlockId.toString(),
        execution.occurrenceDate.toString(),
      ),
      actualStartedAt: execution.actualStartedAt?.toISOString() ?? null,
      actualEndedAt: execution.actualEndedAt?.toISOString() ?? null,
      status: execution.status,
      note: execution.note,
      createdAt: execution.createdAt.toISOString(),
      updatedAt: execution.updatedAt.toISOString(),
      version: execution.version,
    };
  }

  public static fromRecord(value: unknown): RoutineOccurrenceExecution {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const routineBlockId = readEntityId(record, 'routineBlockId');
    const occurrenceDate = readDayDate(record, 'occurrenceDate');
    const status = readString(record, 'status');
    if (!isExecutionStatus(status)) {
      throw invalidRecord('Поле status содержит неизвестное состояние выполнения блока.');
    }
    if (
      readString(record, 'occurrenceKey') !==
      routineExecutionOccurrenceKey(routineBlockId.toString(), occurrenceDate.toString())
    ) {
      throw invalidRecord('Составной ключ выполнения не соответствует его появлению.');
    }
    return RoutineOccurrenceExecution.rehydrate({
      id: readEntityId(record, 'id'),
      routineBlockId,
      occurrenceDate,
      actualStartedAt: readNullableIsoDate(record, 'actualStartedAt'),
      actualEndedAt: readNullableIsoDate(record, 'actualEndedAt'),
      status,
      note: readNullableString(record, 'note'),
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

export function routineExecutionOccurrenceKey(
  routineBlockId: string,
  occurrenceDate: string,
): string {
  return `${routineBlockId}\u0000${occurrenceDate}`;
}

function isExecutionStatus(value: string): value is RoutineExecutionStatus {
  return Object.values(ROUTINE_EXECUTION_STATUS).some((status) => status === value);
}
