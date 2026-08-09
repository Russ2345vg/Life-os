import { describe, expect, it } from 'vitest';
import { EntityId } from '../../domain';
import { InMemorySphereRepository } from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { GetSpheres } from '../queries/GetSpheres';
import { ArchiveSphere } from './ArchiveSphere';
import { CreateSphere } from './CreateSphere';
import { DEFAULT_SPHERES, EnsureDefaultSpheres } from './EnsureDefaultSpheres';
import { RestoreSphere } from './RestoreSphere';
import { UpdateSphere } from './UpdateSphere';

function setup() {
  const repository = new InMemorySphereRepository();
  const clock = new FakeClock(new Date('2026-08-08T08:00:00.000Z'));
  return {
    repository,
    clock,
    create: new CreateSphere(repository, clock, new FakeIdGenerator('sphere')),
    update: new UpdateSphere(repository, clock),
    archive: new ArchiveSphere(repository, clock),
    restore: new RestoreSphere(repository, clock),
    query: new GetSpheres(repository),
    ensureDefaults: new EnsureDefaultSpheres(repository, clock),
  };
}

describe('sphere commands and query', () => {
  it('creates a custom sphere and returns it immediately', async () => {
    const app = setup();
    const result = await app.create.execute({ name: ' Творчество ', description: 'Рисование' });

    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Творчество', description: 'Рисование', version: 1 },
    });
    expect((await app.query.execute()).active.map((sphere) => sphere.name)).toEqual(['Творчество']);
  });

  it('does not persist an invalid name', async () => {
    const app = setup();
    expect(await app.create.execute({ name: '  ' })).toMatchObject({
      ok: false,
      error: { code: 'sphere.name_required' },
    });
    expect(await app.repository.findAll()).toHaveLength(0);
  });

  it.each([' здоровье ', 'ЗДОРОВЬЕ'])(
    'rejects an obvious duplicate name: %s',
    async (duplicate) => {
      const app = setup();
      await app.create.execute({ name: 'Здоровье' });
      expect(await app.create.execute({ name: duplicate })).toMatchObject({
        ok: false,
        error: { code: 'sphere.name_conflict' },
      });
      expect(await app.repository.findAll()).toHaveLength(1);
    },
  );

  it('seeds exactly the standard six spheres idempotently', async () => {
    const app = setup();
    await app.ensureDefaults.execute();
    await app.ensureDefaults.execute();

    const snapshot = await app.query.execute();
    expect(snapshot.active).toHaveLength(6);
    expect(snapshot.active.map((sphere) => sphere.name).sort()).toEqual(
      DEFAULT_SPHERES.map((sphere) => sphere.name).sort(),
    );
    expect(new Set(snapshot.active.map((sphere) => sphere.id.toString())).size).toBe(6);
  });

  it('keeps a user sphere while repeating default initialization', async () => {
    const app = setup();
    await app.ensureDefaults.execute();
    await app.create.execute({ name: 'Творчество' });
    await app.ensureDefaults.execute();

    expect((await app.query.execute()).active).toHaveLength(7);
  });

  it('updates, archives, separates and restores a sphere', async () => {
    const app = setup();
    const created = await app.create.execute({ name: 'Творчество' });
    if (!created.ok) throw created.error;
    const updated = await app.update.execute({
      id: created.value.id,
      expectedVersion: created.value.version,
      name: 'Творческие проекты',
      description: 'Иллюстрация',
    });
    if (!updated.ok) throw updated.error;
    const archived = await app.archive.execute({
      id: updated.value.id,
      expectedVersion: updated.value.version,
    });
    if (!archived.ok) throw archived.error;

    expect(await app.query.execute()).toMatchObject({ active: [], archived: [{ version: 3 }] });
    const restored = await app.restore.execute({
      id: archived.value.id,
      expectedVersion: archived.value.version,
    });
    expect(restored).toMatchObject({
      ok: true,
      value: { name: 'Творческие проекты', status: 'active', version: 4 },
    });
  });

  it('rejects stale updates without losing the fresh version', async () => {
    const app = setup();
    const created = await app.create.execute({ name: 'Творчество' });
    if (!created.ok) throw created.error;
    await app.update.execute({
      id: created.value.id,
      expectedVersion: 1,
      name: 'Свежая версия',
    });
    const stale = await app.update.execute({
      id: created.value.id,
      expectedVersion: 1,
      name: 'Устаревшая версия',
    });

    expect(stale).toMatchObject({ ok: false, error: { code: 'sphere.version_conflict' } });
    expect((await app.repository.findById(EntityId.create('sphere-1')))?.name).toBe(
      'Свежая версия',
    );
  });

  it('rejects renaming to another active or archived name', async () => {
    const app = setup();
    const first = await app.create.execute({ name: 'Первая' });
    const second = await app.create.execute({ name: 'Вторая' });
    if (!first.ok || !second.ok) throw new Error('Fixtures were not created');
    await app.archive.execute({ id: first.value.id, expectedVersion: first.value.version });

    expect(
      await app.update.execute({
        id: second.value.id,
        expectedVersion: second.value.version,
        name: ' ПЕРВАЯ ',
      }),
    ).toMatchObject({ ok: false, error: { code: 'sphere.name_conflict' } });
  });
});
