import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import * as infrastructure from '../index';
import { EntityId, WalkCapture } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';

const databases: infrastructure.LifeOsIndexedDb[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});
const now = new Date('2026-08-26T08:00:05Z');
const later = new Date('2026-08-26T08:01:00Z');
const thought = (id = 'capture-1', walkId = 'walk-1') =>
  WalkCapture.create({
    id: EntityId.create(id),
    walkId: EntityId.create(walkId),
    content: 'Сохранённая мысль',
    capturedAt: now,
    walkElapsedMs: 5000,
  });

function setup(kind: 'memory' | 'indexeddb', factory = new IDBFactory()) {
  const database = new infrastructure.LifeOsIndexedDb(factory);
  databases.push(database);
  if (kind === 'memory') {
    expect(infrastructure).toHaveProperty('InMemoryWalkCaptureRepository');
    return { database, repository: new infrastructure.InMemoryWalkCaptureRepository() };
  }
  expect(infrastructure).toHaveProperty('IndexedDbWalkCaptureRepository');
  return { database, repository: new infrastructure.IndexedDbWalkCaptureRepository(database) };
}

describe.each(['memory', 'indexeddb'] as const)('WalkCaptureRepository %s', (kind) => {
  it('keeps separate thoughts, filters by Walk and hides only processed from pending', async () => {
    const { repository } = setup(kind);
    const first = thought();
    await repository.insert(first);
    await repository.insert(thought('capture-2'));
    await repository.insert(thought('capture-3', 'walk-2'));
    expect(await repository.findById(first.id)).toEqual(first);
    expect(await repository.findById(EntityId.create('missing'))).toBeNull();
    expect(await repository.findPending()).toHaveLength(3);
    expect(await repository.updateIfVersionMatches(first.process(later), 1)).toBe(true);
    expect((await repository.findPending()).map((c) => c.id.toString()).sort()).toEqual([
      'capture-2',
      'capture-3',
    ]);
    expect(await repository.findByWalkId(first.walkId)).toHaveLength(2);
    expect(await repository.findById(first.id)).toMatchObject({ status: 'processed', version: 2 });
  });

  it('does not overwrite an existing capture on duplicate insert', async () => {
    const { repository } = setup(kind);
    const original = thought();
    await repository.insert(original);
    await expect(repository.insert(original.updateContent('Не затирать', later))).rejects.toThrow();
    expect(await repository.findById(original.id)).toEqual(original);
  });

  it('serializes competing updates and rejects stale/missing versions', async () => {
    const { repository } = setup(kind);
    const original = thought();
    await repository.insert(original);
    const results = await Promise.all([
      repository.updateIfVersionMatches(original.process(later), 1),
      repository.updateIfVersionMatches(original.updateContent('Другая вкладка', later), 1),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repository.updateIfVersionMatches(original, 1)).toBe(false);
    expect(await repository.updateIfVersionMatches(thought('missing'), 1)).toBe(false);
    expect(await repository.findById(original.id)).toMatchObject({ version: 2 });
  });
});

it('WalkCapture persistence survives closing and reopening the database', async () => {
  const factory = new IDBFactory();
  const first = setup('indexeddb', factory);
  const capture = thought();
  await first.repository.insert(capture);
  first.database.close();
  const reopened = setup('indexeddb', factory);
  expect(await reopened.repository.findById(capture.id)).toEqual(capture);
  expect(await reopened.repository.updateIfVersionMatches(capture.process(later), 1)).toBe(true);
  reopened.database.close();
  const again = setup('indexeddb', factory);
  expect(await again.repository.findPending()).toEqual([]);
  expect(await again.repository.findById(capture.id)).toMatchObject({ status: 'processed' });
});

it('WalkCapture CAS resolves competing tab-like connections without losing the winning update', async () => {
  const factory = new IDBFactory();
  const first = setup('indexeddb', factory);
  const second = setup('indexeddb', factory);
  const original = thought();
  await first.repository.insert(original);
  const left = (await first.repository.findById(original.id))!;
  const right = (await second.repository.findById(original.id))!;
  const candidates = [left.process(later), right.updateContent('Другая вкладка', later)];
  const results = await Promise.all([
    first.repository.updateIfVersionMatches(candidates[0]!, 1),
    second.repository.updateIfVersionMatches(candidates[1]!, 1),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  const winner = candidates[results.findIndex(Boolean)]!;
  expect(await first.repository.findById(original.id)).toEqual(winner);
  expect(await second.repository.findById(original.id)).toEqual(winner);
});

it('WalkCapture schema upgrades a live v17 connection and preserves every existing store record', async () => {
  const factory = new IDBFactory();
  const legacyStores = Object.values(infrastructure.LIFE_OS_STORE).filter(
    (name) => name !== 'walkCaptures',
  );
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('lifeos', 17);
    request.onupgradeneeded = () => {
      for (const name of legacyStores) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  expect([...legacy.objectStoreNames]).not.toContain('walkCaptures');
  for (const name of legacyStores) {
    await executeIndexedDbRequest(legacy, name, 'readwrite', (store) =>
      store.add({
        id: 'legacy-record',
        content: 'Данные до WALK-10',
        version: 7,
        context: { source: name },
      }),
    );
  }
  let notified = false;
  // Previous builds close their connection on versionchange, as LifeOsIndexedDb does.
  legacy.addEventListener('versionchange', () => {
    notified = true;
    legacy.close();
  });
  const database = new infrastructure.LifeOsIndexedDb(factory);
  databases.push(database);
  const upgraded = await database.open();
  expect(notified).toBe(true);
  expect([...upgraded.objectStoreNames]).toContain('walkCaptures');
  expect(upgraded.version).toBe(18);
  const captures = upgraded.transaction('walkCaptures').objectStore('walkCaptures');
  expect(captures.keyPath).toBe('id');
  expect([...captures.indexNames]).toEqual(['byStatus', 'byWalkId']);
  expect(captures.index('byWalkId').unique).toBe(false);
  for (const name of legacyStores) {
    expect(
      await executeIndexedDbRequest(upgraded, name, 'readonly', (store) =>
        store.get('legacy-record'),
      ),
    ).toEqual({
      id: 'legacy-record',
      content: 'Данные до WALK-10',
      version: 7,
      context: { source: name },
    });
  }
  expect(
    await executeIndexedDbRequest(upgraded, 'walkCaptures', 'readonly', (store) => store.getAll()),
  ).toEqual([]);
});
