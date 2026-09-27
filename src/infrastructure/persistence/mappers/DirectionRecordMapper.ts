import { Direction, isDirectionStatus } from '../../../domain';
import {
  balanceImportance,
  balanceScore,
  directionMode,
} from '../../../domain/balance/BalanceImportance';
import type { DirectionRecord } from '../records/DirectionRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readEntityId,
  readIsoDate,
  readNullableEntityId,
  readNullableString,
  readNumber,
  readOptionalNullableString,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class DirectionRecordMapper {
  public static toRecord(direction: Direction): DirectionRecord {
    return {
      importance: direction.importance,
      manualScore: direction.manualScore,
      mode: direction.mode,
      currentStateText: direction.currentStateText,
      schemaVersion: 1,
      id: direction.id.toString(),
      sphereId: direction.sphereId?.toString() ?? null,
      name: direction.name,
      need: direction.need,
      description: direction.description,
      strategicIntent: direction.strategicIntent,
      desiredState: direction.desiredState,
      inScope: direction.inScope,
      outOfScope: direction.outOfScope,
      status: direction.status,
      isMain: direction.isMain,
      createdAt: direction.createdAt.toISOString(),
      updatedAt: direction.updatedAt.toISOString(),
      version: direction.version,
    };
  }

  public static fromRecord(value: unknown): Direction {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const status = readString(record, 'status');
    if (!isDirectionStatus(status)) throw invalidRecord('Неизвестный статус направления.');
    return Direction.rehydrate({
      importance: balanceImportance(record.importance),
      manualScore: balanceScore(record.manualScore),
      mode: directionMode(record.mode),
      currentStateText: readOptionalNullableString(record, 'currentStateText'),
      id: readEntityId(record, 'id'),
      sphereId: readNullableEntityId(record, 'sphereId'),
      name: readString(record, 'name'),
      need: readOptionalNullableString(record, 'need'),
      description: readNullableString(record, 'description'),
      strategicIntent: readOptionalNullableString(record, 'strategicIntent'),
      desiredState: readOptionalNullableString(record, 'desiredState'),
      inScope: readOptionalNullableString(record, 'inScope'),
      outOfScope: readOptionalNullableString(record, 'outOfScope'),
      status,
      isMain: readOptionalBoolean(record, 'isMain') ?? false,
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function readOptionalBoolean(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw invalidRecord(`Поле ${key} должно быть логическим.`);
  return value;
}
