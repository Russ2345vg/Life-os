import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Walk, WALK_TYPE } from '../../domain';
import { InMemoryWalkRepository } from '../../infrastructure';
import { FakeClock } from '../../test/helpers/Fakes';
import { UpdateWalkSphere } from './UpdateWalkSphere';

const NOW = new Date('2026-08-08T08:00:00.000Z');

describe('UpdateWalkSphere', () => {
  it('assigns, changes, and removes a sphere through an application command', async () => {
    const walk = createWalk();
    const repository = new InMemoryWalkRepository([walk]);
    const command = new UpdateWalkSphere(repository, new FakeClock(NOW));

    const assigned = await command.execute({
      walkId: walk.id,
      expectedVersion: walk.version,
      sphereId: EntityId.create('sphere-health'),
    });
    expect(assigned.ok && assigned.value.sphereId?.toString()).toBe('sphere-health');

    if (!assigned.ok) throw assigned.error;
    const changed = await command.execute({
      walkId: walk.id,
      expectedVersion: assigned.value.version,
      sphereId: EntityId.create('sphere-growth'),
    });
    expect(changed.ok && changed.value.sphereId?.toString()).toBe('sphere-growth');

    if (!changed.ok) throw changed.error;
    const removed = await command.execute({
      walkId: walk.id,
      expectedVersion: changed.value.version,
      sphereId: null,
    });
    expect(removed.ok && removed.value.sphereId).toBeNull();
  });

  it('rejects a stale expectedVersion without changing the stored walk', async () => {
    const walk = createWalk();
    const repository = new InMemoryWalkRepository([walk]);
    const command = new UpdateWalkSphere(repository, new FakeClock(NOW));

    const result = await command.execute({
      walkId: walk.id,
      expectedVersion: walk.version + 1,
      sphereId: EntityId.create('sphere-health'),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'walk.version_conflict' } });
    expect((await repository.findById(walk.id))?.sphereId).toBeNull();
  });
});

function createWalk(): Walk {
  return Walk.create({
    id: EntityId.create('walk-sphere-command'),
    date: DayDate.create('2026-08-08'),
    type: WALK_TYPE.physical,
    now: new Date('2026-08-08T07:00:00.000Z'),
  });
}
