import {
  ExerciseDefinition,
  isExerciseDefinitionSource,
  isExerciseMeasurementType,
} from '../../../domain';
import type { ExerciseDefinitionRecord } from '../records/ExerciseDefinitionRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class ExerciseDefinitionRecordMapper {
  public static toRecord(definition: ExerciseDefinition): ExerciseDefinitionRecord {
    return {
      schemaVersion: 1,
      id: definition.id.toString(),
      name: definition.name,
      normalizedName: definition.normalizedName,
      measurementType: definition.measurementType,
      source: definition.source,
      createdAt: definition.createdAt.toISOString(),
      updatedAt: definition.updatedAt.toISOString(),
      archivedAt: definition.archivedAt?.toISOString() ?? null,
      version: definition.version,
    };
  }

  public static fromRecord(value: unknown): ExerciseDefinition {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const measurementType = readString(record, 'measurementType');
    const source = readString(record, 'source');
    if (!isExerciseMeasurementType(measurementType) || !isExerciseDefinitionSource(source)) {
      throw invalidRecord('Запись определения упражнения содержит неизвестный тип.');
    }
    return ExerciseDefinition.rehydrate({
      id: readEntityId(record, 'id'),
      name: readString(record, 'name'),
      normalizedName: readString(record, 'normalizedName'),
      measurementType,
      source,
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      archivedAt: readNullableIsoDate(record, 'archivedAt'),
      version: readNumber(record, 'version'),
    });
  }
}
