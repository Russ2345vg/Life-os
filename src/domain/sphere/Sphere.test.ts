import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import { MAX_SPHERE_NAME_LENGTH, Sphere, sphereNameKey } from './Sphere';
import { SPHERE_STATUS } from './SphereStatus';

const NOW = new Date('2026-08-08T08:00:00.000Z');

describe('Sphere', () => {
  it('creates an active sphere and normalizes its fields', () => {
    const sphere = Sphere.create({
      id: EntityId.create('sphere-creativity'),
      name: '  Моё   творчество  ',
      description: '  Личные цели  ',
      icon: '  🎨  ',
      color: '#AABBCC',
      now: NOW,
    });

    expect(sphere).toMatchObject({
      name: 'Моё творчество',
      description: 'Личные цели',
      icon: '🎨',
      color: '#aabbcc',
      status: SPHERE_STATUS.active,
      version: 1,
    });
    expect(sphere.createdAt).toEqual(NOW);
    expect(sphere.updatedAt).toEqual(NOW);
  });

  it.each([
    ['', 'sphere.name_required'],
    ['   ', 'sphere.name_required'],
    ['x'.repeat(MAX_SPHERE_NAME_LENGTH + 1), 'sphere.name_too_long'],
  ])('rejects invalid name %#', (name, code) => {
    expect(() => Sphere.create({ id: EntityId.create('sphere'), name, now: NOW })).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('uses a case-insensitive whitespace-normalized name key', () => {
    expect(sphereNameKey(' ЗДОРОВЬЕ ')).toBe(sphereNameKey('здоровье'));
    expect(sphereNameKey('Личное   развитие')).toBe(sphereNameKey('личное развитие'));
  });

  it('updates, archives and restores with optimistic versions', () => {
    const created = Sphere.create({ id: EntityId.create('sphere'), name: 'Творчество', now: NOW });
    const updated = created.update(
      { name: 'Творчество', description: 'Рисование', icon: '🎨', color: '#445566' },
      new Date('2026-08-08T09:00:00.000Z'),
    );
    const archived = updated.archive(new Date('2026-08-08T10:00:00.000Z'));
    const restored = archived.restore(new Date('2026-08-08T11:00:00.000Z'));

    expect(updated).toMatchObject({ description: 'Рисование', version: 2 });
    expect(archived).toMatchObject({ status: SPHERE_STATUS.archived, version: 3 });
    expect(restored).toMatchObject({ status: SPHERE_STATUS.active, version: 4 });
  });
});
