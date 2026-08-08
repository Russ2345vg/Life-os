import {
  RoutineBlock,
  RoutineBlockRecurrence,
  ROUTINE_BLOCK_ASSIGNMENT,
  createRoutineBlockAssignment,
  isRoutineBlockAssignmentKind,
  isRoutineBlockCategory,
  isRoutineBlockRecurrenceKind,
  type IsoWeekday,
} from '../../../domain';
import {
  invalidRecord,
  assertRecordAndSchemaVersion,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';
import type { RoutineBlockRecord } from '../records/RoutineBlockRecord';

export class RoutineBlockRecordMapper {
  public static toRecord(block: RoutineBlock): RoutineBlockRecord {
    return {
      schemaVersion: 1,
      id: block.id.toString(),
      anchorDate: block.anchorDate.toString(),
      title: block.title,
      startTime: block.startTime,
      endTime: block.endTime,
      category: block.category,
      recurrence: block.recurrence.kind,
      selectedWeekdays: [...block.recurrence.selectedWeekdays],
      required: block.required,
      assignment: block.assignment.kind,
      ...(block.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
        ? { actionId: block.assignment.actionId.toString() }
        : {}),
      createdAt: block.createdAt.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
      version: block.version,
    };
  }

  public static fromRecord(value: unknown): RoutineBlock {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const category = readString(record, 'category');
    const recurrence = readString(record, 'recurrence');
    if (!isRoutineBlockCategory(category)) {
      throw invalidRecord('Поле category содержит неизвестную категорию блока.');
    }
    if (!isRoutineBlockRecurrenceKind(recurrence)) {
      throw invalidRecord('Поле recurrence содержит неизвестный режим повторения.');
    }
    const selectedWeekdays = readWeekdays(record);
    const required = record.required;
    if (typeof required !== 'boolean') {
      throw invalidRecord('Поле required должно быть логическим значением.');
    }
    const assignment = readAssignment(record);

    return RoutineBlock.rehydrate({
      id: readEntityId(record, 'id'),
      anchorDate: readDayDate(record, 'anchorDate'),
      title: readString(record, 'title'),
      startTime: readString(record, 'startTime'),
      endTime: readString(record, 'endTime'),
      category,
      recurrence: RoutineBlockRecurrence.create(recurrence, selectedWeekdays),
      required,
      assignment,
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function readAssignment(record: UnknownRecord) {
  if (record.assignment === undefined) {
    return createRoutineBlockAssignment(ROUTINE_BLOCK_ASSIGNMENT.reminder);
  }
  if (typeof record.assignment !== 'string' || !isRoutineBlockAssignmentKind(record.assignment)) {
    throw invalidRecord('Поле assignment содержит неизвестное назначение блока.');
  }
  return createRoutineBlockAssignment(
    record.assignment,
    record.assignment === ROUTINE_BLOCK_ASSIGNMENT.existingAction
      ? readEntityId(record, 'actionId')
      : undefined,
  );
}

function readWeekdays(record: UnknownRecord): readonly IsoWeekday[] {
  const value = record.selectedWeekdays;
  if (
    !Array.isArray(value) ||
    !value.every((weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7)
  ) {
    throw invalidRecord('Поле selectedWeekdays должно содержать дни недели от 1 до 7.');
  }
  return value as IsoWeekday[];
}
