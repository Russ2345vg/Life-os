import { Sphere, isSphereStatus, sphereNameKey } from '../../../domain';
import { balanceImportance, balanceScore } from '../../../domain/balance/BalanceImportance';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readEntityId,
  readIsoDate,
  readNullableString,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';
import type { SphereRecord } from '../records/SphereRecord';

export class SphereRecordMapper {
  public static toRecord(sphere: Sphere): SphereRecord {
    return {
      importance: sphere.importance,
      manualScore: sphere.manualScore,
      desiredLevel: sphere.desiredLevel,
      includeInBalanceWheel: sphere.includeInBalanceWheel,
      schemaVersion: 1,
      id: sphere.id.toString(),
      name: sphere.name,
      normalizedName: sphereNameKey(sphere.name),
      description: sphere.description,
      icon: sphere.icon,
      color: sphere.color,
      status: sphere.status,
      createdAt: sphere.createdAt.toISOString(),
      updatedAt: sphere.updatedAt.toISOString(),
      version: sphere.version,
    };
  }

  public static fromRecord(value: unknown): Sphere {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const name = readString(record, 'name');
    const normalizedName = readString(record, 'normalizedName');
    if (normalizedName !== sphereNameKey(name)) {
      throw invalidRecord('Поле normalizedName сферы не соответствует названию.');
    }
    const status = readString(record, 'status');
    if (!isSphereStatus(status)) {
      throw invalidRecord('Поле status содержит неизвестное состояние сферы.');
    }

    return Sphere.rehydrate({
      importance: balanceImportance(record.importance),
      manualScore: balanceScore(record.manualScore),
      desiredLevel: balanceScore(record.desiredLevel),
      includeInBalanceWheel: readWheelSetting(record.includeInBalanceWheel),
      id: readEntityId(record, 'id'),
      name,
      description: readNullableString(record, 'description'),
      icon: readNullableString(record, 'icon'),
      color: readNullableString(record, 'color'),
      status,
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function readWheelSetting(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw invalidRecord('Участие в колесе должно быть логическим.');
  return value;
}
