import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { EntityId, Goal, Project, Direction, Decision, DecisionTitle } from '../../domain';
import { IndexedDbGoalRepository } from './IndexedDbGoalRepository';
import { IndexedDbProjectRepository } from './IndexedDbProjectRepository';
import { LifeOsIndexedDb, LIFE_OS_STORE, LIFE_OS_SYNC_STORE } from './indexed-db/LifeOsIndexedDb';
import { ProjectRecordMapper } from './mappers/ProjectRecordMapper';
import { ProjectGoalCompatibility } from './mappers/ProjectGoalCompatibility';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import { GOAL_MIGRATION_BACKUP } from './indexed-db/LegacyProjectGoalMigration';
import { parseGoalAlbumRoute } from '../../presentation/goals/GoalAlbumNavigation';
import {
  applyRemotePilotRecord,
  normalizePilotRecord,
  pilotRelationshipReferences,
  prepareRemotePilotRecord,
} from '../sync/pilot/PilotSyncRegistryAdapters';
import { normalizeGoalRecoveryState } from '../sync/recovery/normalizeGoalRecoveryState';

const now = new Date('2026-09-08T01:00:00Z');
const id = EntityId.create('same-id');

describe('single canonical goal album', () => {
  it('adopts the exact old-client projection without duplicating or replacing its local version', async () => {
    const factory = new IDBFactory();
    const old = await openV21(factory);
    const source = Project.rehydrate({
      ...ProjectRecordMapper.toRecord(Project.create({ id, title: 'Перенесённая цель', now })),
      id,
      sphereId: null,
      directionId: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      version: 3,
    });
    const projected = Project.rehydrate({
      ...ProjectRecordMapper.toRecord(source),
      id: EntityId.create('goal-from-project:same-id'),
      sphereId: null,
      directionId: null,
      status: source.status,
      createdAt: now,
      updatedAt: now,
    });
    const historical: Record<string, unknown> = {
      ...ProjectGoalCompatibility.toRecord(projected),
      version: 1,
    };
    delete historical.sphereId;
    delete historical.isMain;
    delete historical.legacyProjectId;
    await put(old, 'projects', ProjectRecordMapper.toRecord(source));
    await put(old, 'goals', historical);
    old.close();
    const db = new LifeOsIndexedDb(factory);
    const database = await db.open();
    const [adopted] = await readAll(database, 'goals');
    expect(adopted).toEqual({
      ...historical,
      sphereId: null,
      isMain: false,
      legacyProjectId: 'same-id',
    });
    expect(await new IndexedDbProjectRepository(db).findAll()).toHaveLength(1);
    expect(
      (await readAll(database, GOAL_MIGRATION_BACKUP)).find((row) => row.store === 'goals')?.value,
    ).toEqual(historical);
    db.close();
    const reopened = new LifeOsIndexedDb(factory);
    const reopenedDatabase = await reopened.open();
    await put(reopenedDatabase, 'projects', ProjectRecordMapper.toRecord(source));
    expect(await readAll(reopenedDatabase, 'goals')).toEqual([adopted]);
    reopened.close();
  });

  it.each([
    { description: 'Другое описание' },
    { whyImportant: 'Самостоятельная цель' },
    { createdAt: '2026-09-07T01:00:00.000Z' },
    { legacyProjectId: 'another-project' },
    { isMain: true },
  ])('still aborts a non-equivalent unmarked projection: %j', async (difference) => {
    const factory = new IDBFactory();
    const old = await openV21(factory);
    const source = Project.create({ id, title: 'Совпадающее название', now });
    const projected = Project.create({
      id: EntityId.create('goal-from-project:same-id'),
      title: source.title,
      now,
    });
    const conflicting = { ...ProjectGoalCompatibility.toRecord(projected), ...difference };
    await put(old, 'projects', ProjectRecordMapper.toRecord(source));
    await put(old, 'goals', conflicting);
    old.close();
    await expect(new LifeOsIndexedDb(factory).open()).rejects.toBeDefined();
    const unchanged = await openV21(factory);
    expect(await readAll(unchanged, 'goals')).toEqual([conflicting]);
    expect(unchanged.objectStoreNames.contains(GOAL_MIGRATION_BACKUP)).toBe(false);
    unchanged.close();
  });

  it('rejects a legacy recovery collision with an unrelated canonical goal', () => {
    const existing = GoalRecordMapper.toRecord(
      Goal.create({ id: EntityId.create('goal-from-project:same-id'), title: 'Моя цель', now }),
    );
    const source = ProjectRecordMapper.toRecord(Project.create({ id, title: 'Legacy', now }));
    const state = normalizeGoalRecoveryState({
      schemaVersion: 1,
      items: [{ entityType: 'project', record: { ...source } }],
    });
    expect(() =>
      prepareRemotePilotRecord('goal', state.items[0]!.record, { ...existing }),
    ).toThrow();
  });
  it('does not resurrect a canonical import deleted before any legacy binding exists', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const database = await db.open();
    await put(database, LIFE_OS_SYNC_STORE.objectMeta, {
      objectId: 'goal-from-project:same-id',
      deleted: true,
    });
    await put(
      database,
      'projects',
      ProjectRecordMapper.toRecord(Project.create({ id, title: 'Legacy', now })),
    );
    expect(await new IndexedDbGoalRepository(db).findAll()).toHaveLength(0);
    db.close();
  });
  it('rolls back the entire version upgrade when a reserved ID is already occupied', async () => {
    const factory = new IDBFactory();
    const old = await openV21(factory);
    const existing = GoalRecordMapper.toRecord(
      Goal.create({ id: EntityId.create('goal-from-project:same-id'), title: 'Сохранить', now }),
    );
    await put(old, 'goals', existing);
    await put(
      old,
      'projects',
      ProjectRecordMapper.toRecord(Project.create({ id, title: 'Legacy', now })),
    );
    old.close();
    await expect(new LifeOsIndexedDb(factory).open()).rejects.toBeDefined();
    const restored = await openV21(factory);
    expect(restored.version).toBe(21);
    expect(await readAll(restored, 'goals')).toEqual([existing]);
    expect(await readAll(restored, 'projects')).toHaveLength(1);
    expect(restored.objectStoreNames.contains(GOAL_MIGRATION_BACKUP)).toBe(false);
    restored.close();
  });
  it('normalizes old sync and recovery links before mapper round-trips, with stable replay', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const database = await db.open();
    const project = ProjectRecordMapper.toRecord(Project.create({ id, title: 'Старая цель', now }));
    const decision = {
      ...DecisionRecordMapper.toRecord(
        Decision.createDraft({
          id: EntityId.create('linked'),
          title: DecisionTitle.create('Шаг'),
          kind: 'additional',
          projectId: id,
          occurredAt: now,
          eventId: EntityId.create('event'),
        }),
      ),
    };
    delete decision.goalLinksVersion;
    const wire = normalizePilotRecord('decision', decision);
    expect(wire.projectId).toBe('goal-from-project:same-id');
    expect(normalizePilotRecord('decision', wire).projectId).toBe(wire.projectId);
    expect(pilotRelationshipReferences('decision', wire)).toContainEqual({
      entityType: 'goal',
      objectId: wire.projectId,
      required: true,
    });
    await applyRemotePilotRecord(database, 'project', { ...project });
    await applyRemotePilotRecord(database, 'decision', wire);
    await applyRemotePilotRecord(database, 'project', { ...project });
    expect(await new IndexedDbGoalRepository(db).findAll()).toHaveLength(1);
    expect((await readAll(database, 'decisions'))[0]?.projectId).toBe(wire.projectId);
    const state = normalizeGoalRecoveryState({
      schemaVersion: 1,
      items: [
        { entityType: 'project', record: { ...project } },
        { entityType: 'decision', record: { ...decision } },
      ],
    });
    expect(state.items.map((item) => item.entityType)).toEqual(['goal', 'decision']);
    expect(state.items[0]?.record.id).toBe(wire.projectId);
    expect(normalizeGoalRecoveryState(state)).toEqual(state);
    db.close();
  });
  it('upgrades v21 atomically, backs up original rows, preserves direction/decision links and survives reopen', async () => {
    const factory = new IDBFactory();
    const old = await openV21(factory);
    const direction = Direction.create({ id: EntityId.create('direction'), name: 'Развитие', now });
    const project = Project.create({
      id,
      directionId: direction.id,
      title: 'П'.repeat(200),
      isMain: true,
      desiredResult: 'Результат',
      now,
    });
    const existing = GoalRecordMapper.toRecord(
      Goal.create({ id, title: 'Существующая цель', now }),
    );
    const decision = Decision.createDraft({
      id: EntityId.create('decision'),
      title: DecisionTitle.create('Первый шаг'),
      kind: 'additional',
      projectId: id,
      occurredAt: now,
      eventId: EntityId.create('event'),
    });
    const legacyDecision = { ...DecisionRecordMapper.toRecord(decision) };
    delete legacyDecision.goalLinksVersion;
    await put(old, 'directions', DirectionRecordMapper.toRecord(direction));
    await put(old, 'goals', existing);
    await put(old, 'projects', ProjectRecordMapper.toRecord(project));
    await put(old, 'decisions', legacyDecision);
    old.close();
    const db = new LifeOsIndexedDb(factory);
    const database = await db.open();
    const goals = new IndexedDbGoalRepository(db);
    const goal = await goals.findById(EntityId.create('goal-from-project:same-id'));
    expect(goal).toMatchObject({
      title: project.title,
      directionId: direction.id,
      isMain: true,
      achievementCriteria: 'Результат',
      createdAt: now,
      version: 1,
    });
    expect(await goals.findById(id)).toMatchObject({ title: existing.title });
    const rows = await readAll(database, 'decisions');
    expect(rows[0]).toMatchObject({ projectId: goal?.id.toString(), goalLinksVersion: 1 });
    const backups = await readAll(database, GOAL_MIGRATION_BACKUP);
    expect(backups.filter((row) => row.store === 'goals')).toEqual([
      { id: 'goals:same-id', store: 'goals', key: 'same-id', value: existing },
    ]);
    expect(backups.find((row) => row.store === 'decisions')?.value).toEqual(legacyDecision);
    expect(parseGoalAlbumRoute('#/projects/same-id')).toEqual({
      view: 'detail',
      goalId: goal?.id.toString(),
    });
    db.close();
    const reopened = new LifeOsIndexedDb(factory);
    expect(await new IndexedDbGoalRepository(reopened).findAll()).toHaveLength(2);
    reopened.close();
  });

  it('aborts legacy ingress without partial writes when its record is invalid', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const database = await db.open();
    const tx = database.transaction('projects', 'readwrite');
    const aborted = new Promise<void>((resolve) => {
      tx.onabort = () => resolve();
    });
    expect(() => tx.objectStore('projects').put({ id: 'invalid', schemaVersion: 1 })).toThrow();
    await aborted;
    expect(await readAll(database, 'projects')).toEqual([]);
    expect(await readAll(database, 'goals')).toEqual([]);
    expect(await readAll(database, GOAL_MIGRATION_BACKUP)).toEqual([]);
    db.close();
  });

  it('does not conflate prefixed raw project IDs or resurrect a removed migrated goal', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const database = await db.open();
    for (const raw of ['x', 'goal-from-project:x'])
      await put(
        database,
        'projects',
        ProjectRecordMapper.toRecord(Project.create({ id: EntityId.create(raw), title: raw, now })),
      );
    expect(
      (await new IndexedDbGoalRepository(db).findAll()).map((goal) => goal.id.toString()),
    ).toEqual(['goal-from-project:goal-from-project:x', 'goal-from-project:x']);
    await new Promise<void>((resolve) => {
      const tx = database.transaction('goals', 'readwrite');
      tx.objectStore('goals').delete('goal-from-project:x');
      tx.oncomplete = () => resolve();
    });
    await put(
      database,
      'projects',
      ProjectRecordMapper.toRecord(
        Project.create({ id: EntityId.create('x'), title: 'Повтор', now }),
      ),
    );
    expect(await new IndexedDbGoalRepository(db).findAll()).toHaveLength(1);
    db.close();
  });
  it('exposes new goals through the existing decision/project port and preserves album fields on edits', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const goals = new IndexedDbGoalRepository(db);
    const projects = new IndexedDbProjectRepository(db);
    await goals.create(Goal.create({ id, title: 'Мастерская', whyImportant: 'Моя мечта', now }));
    const linked = await projects.findById(id);
    expect(linked?.title).toBe('Мастерская');
    if (!linked) throw new Error('Missing canonical goal');
    expect(
      await projects.updateIfVersionMatches(
        linked.update({ title: 'Новая мастерская' }, now),
        linked.version,
      ),
    ).toBe(true);
    expect(await goals.findById(id)).toMatchObject({
      title: 'Новая мастерская',
      whyImportant: 'Моя мечта',
    });
    expect(await goals.findAll()).toHaveLength(1);
    db.close();
  });

  it('imports a legacy project once without merging an existing goal of the same ID/title', async () => {
    const factory = new IDBFactory();
    const db = new LifeOsIndexedDb(factory);
    const goals = new IndexedDbGoalRepository(db);
    await goals.create(Goal.create({ id, title: 'Мастерская', now }));
    const source = ProjectRecordMapper.toRecord(
      Project.create({ id, title: 'Мастерская', desiredResult: 'Открыта', now }),
    );
    const database = await db.open();
    await put(database, LIFE_OS_STORE.projects, source);
    expect(await goals.findAll()).toHaveLength(2);
    const transferred = await goals.findById(EntityId.create('goal-from-project:same-id'));
    expect(transferred).toMatchObject({ achievementCriteria: 'Открыта', status: 'active' });
    if (!transferred) throw new Error('Missing migrated goal');
    await goals.updateIfVersionMatches(
      transferred.update({ title: 'Изменена в альбоме' }, now),
      transferred.version,
    );
    await put(database, LIFE_OS_STORE.projects, { ...source, title: 'Старый клиент', version: 2 });
    expect(await goals.findById(transferred.id)).toMatchObject({ title: 'Изменена в альбоме' });
    db.close();
    const reopened = new LifeOsIndexedDb(factory);
    expect(await new IndexedDbGoalRepository(reopened).findAll()).toHaveLength(2);
    reopened.close();
  });
});

function readAll(database: IDBDatabase, name: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(name, 'readonly').objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
    request.onerror = () => reject(request.error);
  });
}

function openV21(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('lifeos', 21);
    request.onupgradeneeded = () => {
      for (const name of [...Object.values(LIFE_OS_STORE), ...Object.values(LIFE_OS_SYNC_STORE)]) {
        const store = request.result.createObjectStore(name, { keyPath: 'id' });
        if (name === 'goals') store.createIndex('byDirectionId', 'directionId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(database: IDBDatabase, store: string, record: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
