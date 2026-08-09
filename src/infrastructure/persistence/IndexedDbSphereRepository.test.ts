import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  ArchiveSphere,
  CreateSphere,
  EnsureDefaultSpheres,
  GetSpheres,
  RestoreSphere,
  UpdateSphere,
} from '../../application';
import { EntityId, Sphere } from '../../domain';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbSphereRepository } from './IndexedDbSphereRepository';

function services(database: LifeOsIndexedDb, prefix: string) {
  const repository = new IndexedDbSphereRepository(database);
  const clock = new FakeClock(new Date('2026-08-08T08:00:00.000Z'));
  return {
    repository,
    create: new CreateSphere(repository, clock, new FakeIdGenerator(prefix)),
    update: new UpdateSphere(repository, clock),
    archive: new ArchiveSphere(repository, clock),
    restore: new RestoreSphere(repository, clock),
    query: new GetSpheres(repository),
    ensureDefaults: new EnsureDefaultSpheres(repository, clock),
  };
}

describe('IndexedDbSphereRepository', () => {
  it('restores a custom updated sphere after IndexedDB reopen (F5)', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'custom');
    const created = await first.create.execute({
      name: 'Творчество',
      description: 'Рисование',
      icon: '🎨',
      color: '#8844aa',
    });
    if (!created.ok) throw created.error;
    const updated = await first.update.execute({
      id: created.value.id,
      expectedVersion: created.value.version,
      name: 'Творческие проекты',
      description: 'Иллюстрация и музыка',
      icon: '✦',
      color: '#4455aa',
    });
    if (!updated.ok) throw updated.error;
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const snapshot = await services(reopenedDatabase, 'reopened').query.execute();

    expect(snapshot.active).toHaveLength(1);
    expect(snapshot.active[0]).toMatchObject({
      name: 'Творческие проекты',
      description: 'Иллюстрация и музыка',
      icon: '✦',
      color: '#4455aa',
      version: 2,
    });
    reopenedDatabase.close();
  });

  it('keeps archive/restore state after reopen', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'archive');
    const created = await first.create.execute({ name: 'Творчество' });
    if (!created.ok) throw created.error;
    await first.archive.execute({ id: created.value.id, expectedVersion: created.value.version });
    firstDatabase.close();

    const secondDatabase = new LifeOsIndexedDb(factory);
    const second = services(secondDatabase, 'restore');
    const archived = (await second.query.execute()).archived[0];
    expect(archived).toMatchObject({ name: 'Творчество', status: 'archived', version: 2 });
    if (archived === undefined) throw new Error('Archived sphere was not restored');
    await second.restore.execute({ id: archived.id, expectedVersion: archived.version });
    secondDatabase.close();

    const thirdDatabase = new LifeOsIndexedDb(factory);
    expect((await services(thirdDatabase, 'final').query.execute()).active[0]).toMatchObject({
      name: 'Творчество',
      status: 'active',
      version: 3,
    });
    thirdDatabase.close();
  });

  it('enforces duplicate names in the store across concurrent commands', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const first = services(database, 'first');
    const second = services(database, 'second');
    const results = await Promise.all([
      first.create.execute({ name: ' Здоровье ' }),
      second.create.execute({ name: 'ЗДОРОВЬЕ' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(await first.repository.findAll()).toHaveLength(1);
    database.close();
  });

  it('seeds the standard set idempotently across reopen', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    await services(firstDatabase, 'first').ensureDefaults.execute();
    firstDatabase.close();

    const secondDatabase = new LifeOsIndexedDb(factory);
    const second = services(secondDatabase, 'second');
    await second.ensureDefaults.execute();

    expect((await second.query.execute()).active).toHaveLength(6);
    secondDatabase.close();
  });

  it('rejects an optimistic version conflict atomically', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbSphereRepository(database);
    const original = Sphere.create({
      id: EntityId.create('sphere-versioned'),
      name: 'Исходная',
      now: new Date('2026-08-08T08:00:00.000Z'),
    });
    await repository.createIfNameAvailable(original);
    const fresh = original.update({ name: 'Свежая' }, new Date('2026-08-08T09:00:00.000Z'));
    await repository.updateIfVersionMatchesAndNameAvailable(fresh, 1);
    const stale = original.update({ name: 'Устаревшая' }, new Date('2026-08-08T09:30:00.000Z'));

    expect(await repository.updateIfVersionMatchesAndNameAvailable(stale, 1)).toBe(
      'versionConflict',
    );
    expect(await repository.findById(original.id)).toMatchObject({ name: 'Свежая', version: 2 });
    database.close();
  });
});
