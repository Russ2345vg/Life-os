import { PROJECT_STATUS, Project, isProjectStatus } from '../../../domain';
import type { ProjectRecord } from '../records/ProjectRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readBoolean,
  readEntityId,
  readIsoDate,
  readNullableEntityId,
  readNullableString,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class ProjectRecordMapper {
  public static toRecord(project: Project): ProjectRecord {
    return {
      schemaVersion: 1,
      id: project.id.toString(),
      sphereId: project.sphereId?.toString() ?? null,
      directionId: project.directionId?.toString() ?? null,
      title: project.title,
      description: project.description,
      desiredResult: project.desiredResult,
      status: project.status,
      isMain: project.isMain,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      version: project.version,
    };
  }

  public static fromRecord(value: unknown): Project {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const status = readString(record, 'status');
    if (!isProjectStatus(status)) throw invalidRecord('Неизвестный статус проекта.');
    return Project.rehydrate({
      id: readEntityId(record, 'id'),
      sphereId: readNullableEntityId(record, 'sphereId'),
      directionId: readNullableEntityId(record, 'directionId'),
      title: readString(record, 'title'),
      description: readNullableString(record, 'description'),
      desiredResult: readNullableString(record, 'desiredResult'),
      status,
      // Patch 1 allowed an inactive record to retain isMain. Normalize that legacy
      // inconsistency on read so the stricter domain invariant cannot break startup.
      isMain: status === PROJECT_STATUS.active && readBoolean(record, 'isMain'),
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}
