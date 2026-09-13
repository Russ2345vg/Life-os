import { normalizeLegacyGoalLinks } from '../../../shared/legacyGoalIdentity';
import { DayDate } from '../../../domain';
import type { PilotEntityType } from '../../../application/sync/pilot';
import { DomainError } from '../../../shared/errors/DomainError';
import {
  LIFE_OS_SYNC_STORE,
  SINGLETON_SYNC_STORES,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import { normalizePilotRecord, pilotRegistrationFor } from './PilotSyncRegistryAdapters';

type RecordValue = Readonly<Record<string, unknown>>;
const singletonIndexes = {
  day: 'byDate',
  morning_cycle: 'byDateKey',
  evening_cycle: 'byDateKey',
  tomorrow_plan: 'byTargetDateKey',
  preparation_plan: 'byTargetDayId',
} as const;
export function isDateSingleton(type: PilotEntityType): boolean {
  return type in singletonIndexes;
}
export const IDENTITY_READ_STORES = [...SINGLETON_SYNC_STORES, LIFE_OS_SYNC_STORE.settings];
const prefix = (type: PilotEntityType) => `lifeos:singleton:${type}:`;
const aliasKey = (type: PilotEntityType, id: string) => `singleton-alias:${type}:${id}`;
interface Binding {
  readonly id: string;
  readonly logicalObjectId: string;
  readonly localObjectId: string;
}

function dateFromId(type: PilotEntityType, id: string): string | null {
  return id.startsWith(prefix(type))
    ? DayDate.create(id.slice(prefix(type).length)).toString()
    : null;
}

async function binding(tx: IDBTransaction, type: PilotEntityType, id: string) {
  return request<Binding | undefined>(
    tx.objectStore(LIFE_OS_SYNC_STORE.settings).get(aliasKey(type, id)),
  );
}

export async function logicalIdentity(
  tx: IDBTransaction,
  type: PilotEntityType,
  id: string,
  record?: RecordValue | null,
): Promise<string> {
  if (!isDateSingleton(type)) return id;
  const encodedDate = dateFromId(type, id);
  let date: unknown;
  if (record != null) {
    date =
      type === 'day'
        ? record.date
        : type === 'tomorrow_plan'
          ? record.targetDateKey
          : record.dateKey;
    if (type === 'preparation_plan') {
      for (const field of ['targetDayId', 'tomorrowPlanId', 'cycleId']) {
        if (typeof record[field] !== 'string')
          throw new DomainError('sync.pilot_payload_invalid', 'Preparation requires parent IDs.');
      }
      const dayId = String(record.targetDayId);
      const dayLogical = await logicalIdentity(tx, 'day', dayId);
      date = dateFromId('day', dayLogical);
      if (date === null) throw missing();
      const planLogical = await logicalIdentity(tx, 'tomorrow_plan', String(record.tomorrowPlanId));
      const planDate = dateFromId('tomorrow_plan', planLogical);
      if (planDate === null) throw missing();
      if (planDate !== date)
        throw new DomainError(
          'sync.pilot_payload_invalid',
          'Preparation plan and target day dates disagree.',
        );
      const plan = await resolveSyncIdentity(tx, 'tomorrow_plan', String(record.tomorrowPlanId));
      if (plan.existing === undefined) throw missing();
      if (
        (await logicalIdentity(tx, 'evening_cycle', String(plan.existing.cycleId))) !==
        (await logicalIdentity(tx, 'evening_cycle', String(record.cycleId)))
      )
        throw new DomainError(
          'sync.pilot_payload_invalid',
          'Preparation and tomorrow plan cycles disagree.',
        );
    }
  } else if (encodedDate !== null) return id;
  else {
    const known = await binding(tx, type, id);
    if (known !== undefined) return known.logicalObjectId;
    const stored = await request<RecordValue | undefined>(
      tx.objectStore(pilotRegistrationFor(type).storeName).get(id),
    );
    if (stored !== undefined) return logicalIdentity(tx, type, id, stored);
    return id; // Legacy orphan references remain stable IDs until their parent arrives.
  }
  if (typeof date !== 'string')
    throw new DomainError('sync.pilot_payload_invalid', 'Singleton record requires a domain date.');
  const canonicalDate = DayDate.create(date).toString();
  if (record != null) {
    const requireParentDate = async (parentType: PilotEntityType, field: string) => {
      if (typeof record[field] !== 'string')
        throw new DomainError(
          'sync.pilot_payload_invalid',
          'Singleton record requires a parent ID.',
        );
      const logical = await logicalIdentity(tx, parentType, record[field]);
      const parentDate = dateFromId(parentType, logical);
      if (parentDate === null) throw missing();
      return parentDate;
    };
    if (type === 'morning_cycle' || type === 'evening_cycle') {
      if ((await requireParentDate('day', 'dayId')) !== canonicalDate)
        throw new DomainError('sync.pilot_payload_invalid', 'Cycle and day dates disagree.');
    }
    if (type === 'tomorrow_plan') {
      if (
        (await requireParentDate('day', 'targetDayId')) !== canonicalDate ||
        (await requireParentDate('day', 'sourceDayId')) !==
          (await requireParentDate('evening_cycle', 'cycleId'))
      )
        throw new DomainError('sync.pilot_payload_invalid', 'Tomorrow plan parent dates disagree.');
    }
  }
  if (encodedDate !== null && encodedDate !== canonicalDate) {
    throw new DomainError(
      'sync.pilot_payload_invalid',
      'Singleton identity does not match its domain date.',
    );
  }
  return `${prefix(type)}${canonicalDate}`;
}

export async function resolveSyncIdentity(
  tx: IDBTransaction,
  type: PilotEntityType,
  id: string,
  record?: RecordValue | null,
): Promise<{ logicalObjectId: string; localObjectId: string; existing: RecordValue | undefined }> {
  const logicalObjectId = await logicalIdentity(tx, type, id, record);
  const registration = pilotRegistrationFor(type);
  const store = tx.objectStore(
    registration.storageKind === 'local_storage'
      ? LIFE_OS_SYNC_STORE.settings
      : registration.storeName,
  );
  const physicalRecord = await request<RecordValue | undefined>(store.get(id));
  if (
    isDateSingleton(type) &&
    physicalRecord !== undefined &&
    (await logicalIdentity(tx, type, id, physicalRecord)) !== logicalObjectId
  ) {
    throw new DomainError(
      'sync.pilot_payload_invalid',
      'Physical singleton ID cannot be rebound to a different date.',
    );
  }
  let existing: RecordValue | undefined;
  const date = isDateSingleton(type) ? dateFromId(type, logicalObjectId) : null;
  if (date !== null && type in singletonIndexes) {
    let key: string | undefined = date;
    if (type === 'preparation_plan') {
      const day = await resolveSyncIdentity(tx, 'day', `${prefix('day')}${date}`);
      key = day.existing === undefined ? undefined : day.localObjectId;
    }
    if (key !== undefined)
      existing = await request<RecordValue | undefined>(
        store.index(singletonIndexes[type as keyof typeof singletonIndexes]).get(key),
      );
  }
  const known = isDateSingleton(type)
    ? ((await binding(tx, type, logicalObjectId)) ?? (await binding(tx, type, id)))
    : undefined;
  const localObjectId =
    typeof existing?.id === 'string' ? existing.id : (known?.localObjectId ?? id);
  existing ??= await request<RecordValue | undefined>(store.get(localObjectId));
  if (
    existing !== undefined &&
    isDateSingleton(type) &&
    (await logicalIdentity(tx, type, String(existing.id), existing)) !== logicalObjectId
  ) {
    throw new DomainError(
      'sync.pilot_payload_invalid',
      'Physical singleton ID cannot be rebound to a different date.',
    );
  }
  return { logicalObjectId, localObjectId, existing };
}

export async function rememberSyncIdentity(
  tx: IDBTransaction,
  type: PilotEntityType,
  remoteId: string,
  logicalObjectId: string,
  localObjectId: string,
): Promise<void> {
  if (!isDateSingleton(type)) return;
  for (const id of new Set([remoteId, logicalObjectId, localObjectId])) {
    const previous = await binding(tx, type, id);
    if (previous !== undefined && previous.logicalObjectId !== logicalObjectId) {
      throw new DomainError(
        'sync.pilot_payload_invalid',
        'Singleton alias cannot be rebound to a different date.',
      );
    }
    await request(
      tx
        .objectStore(LIFE_OS_SYNC_STORE.settings)
        .put({ id: aliasKey(type, id), logicalObjectId, localObjectId } satisfies Binding),
    );
  }
}

// Only declared foreign/self-reference fields are translated; user text is never rewritten.
export async function translateSyncRecord(
  tx: IDBTransaction,
  type: PilotEntityType,
  source: RecordValue,
  direction: 'wire' | 'local',
  ownId?: string,
): Promise<RecordValue> {
  const record: Record<string, unknown> = {
    ...(['decision', 'journal_entry', 'walk', 'preparation_plan', 'evening_cycle'].includes(type)
      ? normalizeLegacyGoalLinks(source)
      : source),
  };
  const translate = async (targetType: PilotEntityType, id: unknown): Promise<unknown> => {
    if (typeof id !== 'string') return id;
    return direction === 'wire'
      ? logicalIdentity(tx, targetType, id)
      : (await resolveSyncIdentity(tx, targetType, id)).localObjectId;
  };
  record.id =
    ownId ??
    (direction === 'wire' ? await logicalIdentity(tx, type, String(source.id), source) : source.id);
  for (const field of ['dayId', 'sourceDayId', 'targetDayId']) {
    if (
      ['morning_cycle', 'evening_cycle', 'tomorrow_plan', 'preparation_plan'].includes(type) &&
      field in record
    )
      record[field] = await translate('day', record[field]);
  }
  if (type === 'tomorrow_plan' || type === 'preparation_plan')
    record.cycleId = await translate('evening_cycle', record.cycleId);
  if (type === 'preparation_plan') {
    record.tomorrowPlanId = await translate('tomorrow_plan', record.tomorrowPlanId);
    if (Array.isArray(record.items))
      record.items = record.items.map((item) => ({ ...item, planId: record.id }));
    if (direction === 'local') {
      const parent = await request<RecordValue | undefined>(
        tx.objectStore('tomorrowPlans').get(String(record.tomorrowPlanId)),
      );
      if (typeof parent?.version === 'number') {
        record.sourceVersion = parent.version;
        if (typeof record.generationSignature === 'string')
          record.generationSignature = record.generationSignature.replace(
            /\|tomorrow:\d+\|/,
            `|tomorrow:${parent.version}|`,
          );
      }
    }
  }
  if (type === 'journal_entry' && record.subjectType === 'Day')
    record.subjectId = await translate('day', record.subjectId);
  if (type === 'recommendation_application') {
    if (record.targetType === 'TOMORROW_PLAN')
      record.targetId = await translate('tomorrow_plan', record.targetId);
    if (record.targetType === 'PREPARATION_PLAN')
      record.targetId = await translate('preparation_plan', record.targetId);
  }
  if (type === 'evening_cycle') {
    for (const field of ['reflectionResults', 'reflectionSignals', 'reflectionCorrections']) {
      if (Array.isArray(record[field]))
        record[field] = record[field].map((item) => ({ ...item, cycleId: record.id }));
    }
    for (const field of ['openLoopReferences', 'openLoopResolutions']) {
      if (Array.isArray(record[field]))
        record[field] = await Promise.all(
          record[field].map(async (item) =>
            item.entityType === 'Day'
              ? { ...item, entityId: await translate('day', item.entityId) }
              : item,
          ),
        );
    }
  }
  return record;
}

export async function canonicalSyncRecord(
  tx: IDBTransaction,
  type: PilotEntityType,
  source: RecordValue,
): Promise<RecordValue> {
  return translateSyncRecord(tx, type, normalizePilotRecord(type, source), 'wire');
}
function missing() {
  return new DomainError(
    'sync.pilot_dependency_missing',
    'Singleton date parent has not arrived yet.',
  );
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
