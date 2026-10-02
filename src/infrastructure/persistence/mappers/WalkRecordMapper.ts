import {
  MAX_WALK_PHOTO_BYTES,
  PauseInterval,
  Walk,
  WALK_INTENT,
  WALK_STATUS,
  isWalkIntent,
  isWalkImpact,
  isWalkLinkedEntityType,
  isWalkMode,
  isWalkReentry,
  isWalkReentryActionKind,
  isWalkReentryStatus,
  isWalkReflectionStage,
  isWalkReflectionStageForTemplate,
  isWalkReflectionTemplate,
  isWalkReturnOrigin,
  isWalkRoutineContext,
  isWalkStateSnapshot,
  isWalkStatus,
  isWalkType,
  type WalkLinkedEntity,
  type WalkPhoto,
  type WalkReentry,
  type WalkReturnContext,
  type WalkRoutineContext,
  type WalkRoutineOccurrenceReference,
  type WalkStateSnapshot,
} from '../../../domain';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableNumber,
  readNullableString,
  readNumber,
  readOptionalNullableEntityId,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';
import type {
  WalkRecord,
  WalkReentryRecord,
  WalkRoutineContextRecord,
  WalkRoutineOccurrenceReferenceRecord,
} from '../records/WalkRecord';

export class WalkRecordMapper {
  public static toRecord(walk: Walk): WalkRecord {
    return {
      deletedAt: walk.deletedAt?.toISOString() ?? null,
      goalLinksVersion: 1,
      schemaVersion: 1,
      id: walk.id.toString(),
      date: walk.date.toString(),
      type: walk.type,
      sphereId: walk.sphereId?.toString() ?? null,
      intent: walk.intent,
      reflectionTemplate: walk.reflectionTemplate,
      reflectionStage: walk.reflectionStage,
      beforeState: walk.beforeState,
      afterState: walk.afterState,
      impact: walk.impact,
      linkedEntity: toLinkedEntityRecord(walk.linkedEntity),
      returnContext: toReturnContextRecord(walk.returnContext),
      reentry: toReentryRecord(walk.reentry),
      status: walk.status,
      mode: walk.mode,
      startedAt: walk.startedAt?.toISOString() ?? null,
      pausedAt: walk.pausedAt?.toISOString() ?? null,
      pauseIntervals: walk.pauseIntervals.map((interval) => ({
        startedAt: interval.startedAt.toISOString(),
        endedAt: interval.endedAt.toISOString(),
      })),
      endedAt: walk.endedAt?.toISOString() ?? null,
      timerTargetMinutes: walk.timerTargetMinutes,
      reflectionQuestion: walk.reflectionQuestion,
      result: walk.result,
      photo: walk.photo,
      createdAt: walk.createdAt.toISOString(),
      updatedAt: walk.updatedAt.toISOString(),
      version: walk.version,
    };
  }

  public static fromRecord(value: unknown): Walk {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const type = readString(record, 'type');
    if (!isWalkType(type)) {
      throw invalidRecord('Поле type содержит неизвестный тип прогулки.');
    }

    const status = Object.hasOwn(record, 'status')
      ? readString(record, 'status')
      : WALK_STATUS.planned;
    if (!isWalkStatus(status)) {
      throw invalidRecord('Поле status содержит неизвестное состояние прогулки.');
    }
    const mode = Object.hasOwn(record, 'mode') ? readNullableString(record, 'mode') : null;
    if (mode !== null && !isWalkMode(mode)) {
      throw invalidRecord('Поле mode содержит неизвестный режим прогулки.');
    }
    const intent = Object.hasOwn(record, 'intent') ? readNullableString(record, 'intent') : null;
    if (intent !== null && !isWalkIntent(intent)) {
      throw invalidRecord('Поле intent содержит неизвестный режим прогулки.');
    }
    const reflectionTemplate = Object.hasOwn(record, 'reflectionTemplate')
      ? readNullableString(record, 'reflectionTemplate')
      : null;
    if (
      (reflectionTemplate !== null && !isWalkReflectionTemplate(reflectionTemplate)) ||
      (reflectionTemplate !== null && intent !== WALK_INTENT.reflection)
    ) {
      throw invalidRecord('Поле reflectionTemplate содержит неизвестный шаблон размышления.');
    }
    const reflectionStage = Object.hasOwn(record, 'reflectionStage')
      ? readNullableString(record, 'reflectionStage')
      : null;
    if (
      (reflectionStage !== null && !isWalkReflectionStage(reflectionStage)) ||
      (reflectionStage !== null &&
        (reflectionTemplate === null ||
          !isWalkReflectionStageForTemplate(reflectionTemplate, reflectionStage)))
    ) {
      throw invalidRecord('Поле reflectionStage содержит неизвестный этап размышления.');
    }
    const impact = Object.hasOwn(record, 'impact') ? readNullableString(record, 'impact') : null;
    if (impact !== null && !isWalkImpact(impact)) {
      throw invalidRecord('Поле impact содержит неизвестное влияние прогулки.');
    }

    return Walk.rehydrate({
      deletedAt: Object.hasOwn(record, 'deletedAt')
        ? readNullableIsoDate(record, 'deletedAt')
        : null,
      id: readEntityId(record, 'id'),
      date: readDayDate(record, 'date'),
      type,
      sphereId: readOptionalNullableEntityId(record, 'sphereId'),
      intent,
      reflectionTemplate,
      reflectionStage,
      beforeState: Object.hasOwn(record, 'beforeState')
        ? readStateSnapshot(record.beforeState, 'beforeState')
        : null,
      afterState: Object.hasOwn(record, 'afterState')
        ? readStateSnapshot(record.afterState, 'afterState')
        : null,
      impact,
      linkedEntity: Object.hasOwn(record, 'linkedEntity')
        ? readLinkedEntity(record.linkedEntity, 'linkedEntity')
        : null,
      returnContext: Object.hasOwn(record, 'returnContext')
        ? readReturnContext(record.returnContext)
        : null,
      reentry: Object.hasOwn(record, 'reentry') ? readReentry(record.reentry) : null,
      status,
      mode,
      startedAt: Object.hasOwn(record, 'startedAt')
        ? readNullableIsoDate(record, 'startedAt')
        : null,
      pausedAt: Object.hasOwn(record, 'pausedAt') ? readNullableIsoDate(record, 'pausedAt') : null,
      pauseIntervals: Object.hasOwn(record, 'pauseIntervals')
        ? readPauseIntervals(record.pauseIntervals)
        : [],
      endedAt: Object.hasOwn(record, 'endedAt') ? readNullableIsoDate(record, 'endedAt') : null,
      timerTargetMinutes: Object.hasOwn(record, 'timerTargetMinutes')
        ? readNullableNumber(record, 'timerTargetMinutes')
        : null,
      reflectionQuestion: Object.hasOwn(record, 'reflectionQuestion')
        ? readNullableString(record, 'reflectionQuestion')
        : null,
      result: Object.hasOwn(record, 'result') ? readNullableString(record, 'result') : null,
      photo: Object.hasOwn(record, 'photo') ? readPhoto(record.photo) : null,
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function toLinkedEntityRecord(entity: WalkLinkedEntity | null) {
  return entity === null ? null : { type: entity.type, id: entity.id.toString() };
}

function toReturnContextRecord(context: WalkReturnContext | null) {
  return context === null
    ? null
    : {
        origin: context.origin,
        entity: toLinkedEntityRecord(context.entity),
        nextStep: context.nextStep,
        routineContext: toRoutineContextRecord(context.routineContext ?? null),
      };
}

function toRoutineContextRecord(
  context: WalkRoutineContext | null,
): WalkRoutineContextRecord | null {
  return context === null
    ? null
    : {
        source: toRoutineOccurrenceReferenceRecord(context.source),
        sourceTitle: context.sourceTitle,
        next: context.next === null ? null : toRoutineOccurrenceReferenceRecord(context.next),
      };
}

function toRoutineOccurrenceReferenceRecord(
  reference: WalkRoutineOccurrenceReference,
): WalkRoutineOccurrenceReferenceRecord {
  return {
    routineBlockId: reference.routineBlockId.toString(),
    occurrenceDate: reference.occurrenceDate.toString(),
    effectiveDate: reference.effectiveDate.toString(),
  };
}

function toReentryRecord(reentry: WalkReentry | null): WalkReentryRecord | null {
  return reentry === null
    ? null
    : {
        status: reentry.status,
        action: {
          kind: reentry.action.kind,
          destination: reentry.action.destination,
          entity: toLinkedEntityRecord(reentry.action.entity),
          nextStep: reentry.action.nextStep,
          routineContext: toRoutineContextRecord(reentry.action.routineContext ?? null),
        },
        preparedAt: reentry.preparedAt.toISOString(),
        resolvedAt: reentry.resolvedAt?.toISOString() ?? null,
      };
}

function readStateSnapshot(value: unknown, field: string): WalkStateSnapshot | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRecord(`Поле ${field} должно содержать состояние или null.`);
  }
  const state = value as UnknownRecord;
  const snapshot = {
    energy: readNumber(state, 'energy'),
    tension: readNumber(state, 'tension'),
    clarity: readNumber(state, 'clarity'),
  };
  if (!isWalkStateSnapshot(snapshot)) {
    throw invalidRecord(`Поле ${field} содержит недопустимое состояние.`);
  }
  return snapshot;
}

function readLinkedEntity(value: unknown, field: string): WalkLinkedEntity | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRecord(`Поле ${field} должно содержать ссылку на сущность или null.`);
  }
  const entity = value as UnknownRecord;
  const type = readString(entity, 'type');
  if (!isWalkLinkedEntityType(type)) {
    throw invalidRecord(`Поле ${field}.type содержит неизвестный тип сущности.`);
  }
  return { type, id: readEntityId(entity, 'id') };
}

function readReturnContext(value: unknown): WalkReturnContext | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRecord('Поле returnContext должно содержать контекст или null.');
  }
  const context = value as UnknownRecord;
  const origin = readString(context, 'origin');
  if (!isWalkReturnOrigin(origin)) {
    throw invalidRecord('Поле returnContext.origin содержит неизвестный источник.');
  }
  return {
    origin,
    entity: readLinkedEntity(context.entity, 'returnContext.entity'),
    nextStep: readNullableString(context, 'nextStep'),
    routineContext: Object.hasOwn(context, 'routineContext')
      ? readRoutineContext(context.routineContext, 'returnContext.routineContext')
      : null,
  };
}

function readRoutineContext(value: unknown, field: string): WalkRoutineContext | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRecord(`Поле ${field} должно содержать Routine-контекст или null.`);
  }
  const context = value as UnknownRecord;
  const routineContext: WalkRoutineContext = {
    source: readRoutineOccurrenceReference(context.source, `${field}.source`),
    sourceTitle: readString(context, 'sourceTitle'),
    next:
      context.next === null ? null : readRoutineOccurrenceReference(context.next, `${field}.next`),
  };
  if (!isWalkRoutineContext(routineContext)) {
    throw invalidRecord(`Поле ${field} содержит несогласованный Routine-контекст.`);
  }
  return routineContext;
}

function readRoutineOccurrenceReference(
  value: unknown,
  field: string,
): WalkRoutineOccurrenceReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRecord(`Поле ${field} должно содержать ссылку на occurrence.`);
  }
  const reference = value as UnknownRecord;
  return {
    routineBlockId: readEntityId(reference, 'routineBlockId'),
    occurrenceDate: readDayDate(reference, 'occurrenceDate'),
    effectiveDate: readDayDate(reference, 'effectiveDate'),
  };
}

function readReentry(value: unknown): WalkReentry | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRecord('Поле reentry должно содержать возвращение или null.');
  }
  const reentryRecord = value as UnknownRecord;
  const status = readString(reentryRecord, 'status');
  if (!isWalkReentryStatus(status)) {
    throw invalidRecord('Поле reentry.status содержит неизвестное состояние.');
  }
  const actionValue = reentryRecord.action;
  if (typeof actionValue !== 'object' || actionValue === null || Array.isArray(actionValue)) {
    throw invalidRecord('Поле reentry.action должно содержать действие.');
  }
  const actionRecord = actionValue as UnknownRecord;
  const kind = readString(actionRecord, 'kind');
  if (!isWalkReentryActionKind(kind)) {
    throw invalidRecord('Поле reentry.action.kind содержит неизвестное действие.');
  }
  const destination = readString(actionRecord, 'destination');
  if (!isWalkReturnOrigin(destination)) {
    throw invalidRecord('Поле reentry.action.destination содержит неизвестный раздел.');
  }
  const reentry: WalkReentry = {
    status,
    action: {
      kind,
      destination,
      entity: readLinkedEntity(actionRecord.entity, 'reentry.action.entity'),
      nextStep: readNullableString(actionRecord, 'nextStep'),
      routineContext: Object.hasOwn(actionRecord, 'routineContext')
        ? readRoutineContext(actionRecord.routineContext, 'reentry.action.routineContext')
        : null,
    },
    preparedAt: readReentryIsoDate(reentryRecord, 'preparedAt'),
    resolvedAt: readNullableReentryIsoDate(reentryRecord, 'resolvedAt'),
  };
  if (!isWalkReentry(reentry)) {
    throw invalidRecord('Поле reentry содержит несогласованные данные возвращения.');
  }
  return reentry;
}

function readReentryIsoDate(record: UnknownRecord, field: string): Date {
  try {
    return readIsoDate(record, field);
  } catch {
    throw invalidRecord(`Поле reentry.${field} должно содержать ISO-строку UTC.`);
  }
}

function readNullableReentryIsoDate(record: UnknownRecord, field: string): Date | null {
  try {
    return readNullableIsoDate(record, field);
  } catch {
    throw invalidRecord(`Поле reentry.${field} должно содержать ISO-строку UTC или null.`);
  }
}

function readPauseIntervals(value: unknown): readonly PauseInterval[] {
  if (!Array.isArray(value)) {
    throw invalidRecord('Поле pauseIntervals должно быть массивом.');
  }
  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw invalidRecord('Поле pauseIntervals содержит недопустимый интервал.');
    }
    const interval = item as UnknownRecord;
    return PauseInterval.create(
      readIsoDate(interval, 'startedAt'),
      readIsoDate(interval, 'endedAt'),
    );
  });
}

function readPhoto(value: unknown): WalkPhoto | null {
  if (value === null) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRecord('Поле photo должно содержать изображение или null.');
  }
  const photo = value as UnknownRecord;
  const dataUrl = readString(photo, 'dataUrl');
  const mimeType = readString(photo, 'mimeType');
  const sizeBytes = readNumber(photo, 'sizeBytes');
  if (
    !mimeType.startsWith('image/') ||
    !dataUrl.startsWith(`data:${mimeType};base64,`) ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_WALK_PHOTO_BYTES
  ) {
    throw invalidRecord('Поле photo содержит недопустимое изображение.');
  }
  return { dataUrl, mimeType, sizeBytes };
}
