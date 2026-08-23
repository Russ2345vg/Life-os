import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import { Direction } from './Direction';

const now = new Date('2026-08-10T08:00:00.000Z');

describe('Direction', () => {
  it('creates directions with and without a sphere', () => {
    const standalone = Direction.create({
      id: EntityId.create('direction-1'),
      name: ' Работа ',
      now,
    });
    const sphereId = EntityId.create('sphere-1');
    const linked = Direction.create({
      id: EntityId.create('direction-2'),
      sphereId,
      name: 'Развитие продукта',
      now,
    });

    expect(standalone).toMatchObject({
      sphereId: null,
      name: 'Работа',
      status: 'active',
      version: 1,
    });
    expect(linked.sphereId?.equals(sphereId)).toBe(true);
  });

  it('updates, archives and restores without changing the original value', () => {
    const original = Direction.create({ id: EntityId.create('direction-1'), name: 'Работа', now });
    const updated = original.update(
      { name: 'Профессиональное развитие', description: 'Рост компетенций' },
      new Date('2026-08-10T09:00:00.000Z'),
    );
    const archived = updated.archive(new Date('2026-08-10T10:00:00.000Z'));
    const restored = archived.restore(new Date('2026-08-10T11:00:00.000Z'));

    expect(original).toMatchObject({ name: 'Работа', version: 1 });
    expect(updated).toMatchObject({ name: 'Профессиональное развитие', version: 2 });
    expect(archived).toMatchObject({ status: 'archived', version: 3 });
    expect(restored).toMatchObject({ status: 'active', version: 4 });
  });

  it('creates and updates an optional strategic outline', () => {
    const original = Direction.create({
      id: EntityId.create('direction-strategic'),
      name: 'LifeOS',
      strategicIntent: '  Создать систему осознанного управления жизнью.  ',
      desiredState: 'LifeOS поддерживает целостный жизненный контур.',
      inScope: 'Продукт и методология',
      outOfScope: 'Клиентские проекты',
      now,
    });
    const updated = original.update(
      {
        name: original.name,
        strategicIntent: '',
        desiredState: 'Устойчивая работа системы',
      },
      new Date('2026-08-10T09:00:00.000Z'),
    );

    expect(original).toMatchObject({
      strategicIntent: 'Создать систему осознанного управления жизнью.',
      desiredState: 'LifeOS поддерживает целостный жизненный контур.',
      inScope: 'Продукт и методология',
      outOfScope: 'Клиентские проекты',
    });
    expect(updated).toMatchObject({
      strategicIntent: null,
      desiredState: 'Устойчивая работа системы',
      inScope: 'Продукт и методология',
      outOfScope: 'Клиентские проекты',
      version: 2,
    });
  });
});
