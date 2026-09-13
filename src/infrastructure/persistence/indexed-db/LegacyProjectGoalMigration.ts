import { EntityId, Project } from '../../../domain';
import { DomainError } from '../../../shared/errors/DomainError';
import { legacyProjectGoalId, normalizeLegacyGoalLinks } from '../../../shared/legacyGoalIdentity';
import { ProjectRecordMapper } from '../mappers/ProjectRecordMapper';
import { GoalRecordMapper } from '../mappers/GoalRecordMapper';
import { ProjectGoalCompatibility } from '../mappers/ProjectGoalCompatibility';
import type { GoalRecord } from '../records/GoalRecord';

export const GOAL_MIGRATION_BACKUP = 'goal_migration_backup';
export const GOAL_MIGRATION_BINDINGS = 'goal_migration_bindings';
export const GOAL_LINK_STORES = [
  'decisions',
  'journal',
  'walks',
  'preparationPlans',
  'eveningCycles',
];

interface Binding {
  readonly id: string;
  readonly goalId: string;
  readonly canonicalVersion: number;
  readonly source: string;
  readonly blockedSource?: object;
}

export function upgradeLegacyProjects(database: IDBDatabase, tx: IDBTransaction): void {
  database.createObjectStore(GOAL_MIGRATION_BACKUP, { keyPath: 'id' });
  database.createObjectStore(GOAL_MIGRATION_BINDINGS, { keyPath: 'id' });
  tx.objectStore('goals').createIndex('bySphereId', 'sphereId', { unique: false });
  const backup = tx.objectStore(GOAL_MIGRATION_BACKUP);
  const names = ['projects', 'goals', ...GOAL_LINK_STORES];
  const originals = new Map<string, { id: string }[]>();
  for (const name of names) {
    const read = tx.objectStore(name).getAll() as IDBRequest<{ id: string }[]>;
    read.onsuccess = () => {
      originals.set(name, read.result);
      for (const value of read.result)
        backup.put({ id: `${name}:${value.id}`, store: name, key: value.id, value });
      if (originals.size !== names.length) return;
      for (const value of originals.get('projects') ?? []) materializeLegacyProject(tx, value);
      for (const store of GOAL_LINK_STORES)
        for (const value of originals.get(store) ?? []) {
          tx.objectStore(store).put(normalizeLegacyGoalLinks(value));
        }
      // An existing installation must publish the newly canonical goals on its next bootstrap.
      tx.objectStore('sync_settings').delete('structured-bootstrap');
      tx.objectStore('sync_settings').delete('structured-bootstrap:goal');
      tx.objectStore('sync_settings').delete('pilot-bootstrap');
    };
  }
}

export function materializeLegacyProject(
  tx: IDBTransaction,
  value: object,
  onMaterialized?: (goal: GoalRecord) => void,
): void {
  const source = ProjectRecordMapper.fromRecord(value);
  const rawId = source.id.toString();
  const goalId = legacyProjectGoalId(rawId);
  const goals = tx.objectStore('goals');
  const bindings = tx.objectStore(GOAL_MIGRATION_BINDINGS);
  const before = goals.get(goalId) as IDBRequest<GoalRecord | undefined>;
  const binding = bindings.get(rawId) as IDBRequest<Binding | undefined>;
  const meta = tx.objectStore('sync_object_meta').get(goalId) as IDBRequest<
    { deleted: boolean } | undefined
  >;
  meta.onsuccess = () => {
    try {
      if (meta.result?.deleted) return;
      const existing = before.result;
      const known = binding.result;
      const fingerprint = JSON.stringify(ProjectRecordMapper.toRecord(source));
      const projected = Project.rehydrate({
        ...ProjectRecordMapper.toRecord(source),
        id: EntityId.create(goalId),
        sphereId: source.sphereId,
        directionId: source.directionId,
        status: source.status,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        version: existing ? existing.version + 1 : source.version,
      });
      if (existing && existing.legacyProjectId !== rawId) {
        const expected = ProjectGoalCompatibility.toRecord(projected);
        if (isUnmarkedLegacyProjection(existing, expected)) {
          // Older clients dropped provenance/new optional fields on round-trip.
          // Adopt only the complete equivalent projection, retaining its local version.
          const adopted: GoalRecord = {
            ...existing,
            sphereId:
              existing.sphereId === undefined ? (expected.sphereId ?? null) : existing.sphereId,
            isMain: existing.isMain === undefined ? (expected.isMain ?? false) : existing.isMain,
            legacyProjectId: rawId,
          };
          goals.put(adopted);
          bindings.put({
            id: rawId,
            goalId,
            canonicalVersion: adopted.version,
            source: fingerprint,
          } satisfies Binding);
          onMaterialized?.(adopted);
          return;
        }
        throw new DomainError(
          'goal.migration_id_collision',
          'Идентификатор перенесённой цели занят. Исходные данные сохранены.',
        );
      }
      if (known?.source === fingerprint) return;
      if (existing && (!known || existing.version !== known.canonicalVersion)) {
        bindings.put({
          id: rawId,
          goalId,
          canonicalVersion: known?.canonicalVersion ?? -1,
          source: known?.source ?? '',
          blockedSource: value,
        } satisfies Binding);
        return;
      }
      if (!existing && known) return; // A removed canonical goal must never be resurrected by old replay.
      const converted = {
        ...ProjectGoalCompatibility.toRecord(projected, existing),
        legacyProjectId: rawId,
      };
      goals.put(converted);
      bindings.put({
        id: rawId,
        goalId,
        canonicalVersion: converted.version,
        source: fingerprint,
      } satisfies Binding);
      onMaterialized?.(converted);
    } catch {
      tx.abort();
    }
  };
}

function isUnmarkedLegacyProjection(existing: GoalRecord, expected: GoalRecord): boolean {
  if (existing.legacyProjectId != null) return false;
  const normalized: Record<string, unknown> = {
    ...GoalRecordMapper.toRecord(GoalRecordMapper.fromRecord(existing)),
  };
  return Object.entries(expected).every(([key, value]) => {
    // Versions are local to each sync receiver, not proof of shared identity.
    if (key === 'version' || key === 'legacyProjectId') return true;
    if (key === 'sphereId' && existing.sphereId === undefined) return true;
    if (key === 'isMain' && existing.isMain === undefined) return true;
    return JSON.stringify(normalized[key]) === JSON.stringify(value);
  });
}

/** Legacy records are ingress/recovery data. They never form a second application model. */
export function withLegacyGoalIngress(
  tx: IDBTransaction,
  onMaterialized?: (goal: GoalRecord) => void,
): IDBTransaction {
  return new Proxy(tx, {
    get(target, property) {
      if (property === 'objectStore')
        return (name: string) => {
          const store = target.objectStore(name);
          if (name !== 'projects' && !GOAL_LINK_STORES.includes(name)) return store;
          return new Proxy(store, {
            get(objectStore, method) {
              if (method === 'put' || method === 'add')
                return (value: object, key?: IDBValidKey) => {
                  const normalized = name === 'projects' ? value : normalizeLegacyGoalLinks(value);
                  const request =
                    key === undefined
                      ? objectStore[method](normalized)
                      : objectStore[method](normalized, key);
                  if (name === 'projects') {
                    target.objectStore(GOAL_MIGRATION_BACKUP).put({
                      id: `ingress:projects:${String((value as { id: unknown }).id)}`,
                      store: name,
                      value,
                    });
                    try {
                      materializeLegacyProject(target, value, onMaterialized);
                    } catch (error) {
                      target.abort();
                      throw error;
                    }
                  }
                  return request;
                };
              const value: unknown = Reflect.get(objectStore, method, objectStore);
              return typeof value === 'function' ? value.bind(objectStore) : value;
            },
          });
        };
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}
