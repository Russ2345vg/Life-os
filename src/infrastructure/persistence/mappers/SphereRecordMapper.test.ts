import { describe, expect, it } from 'vitest';
import { EntityId, Sphere } from '../../../domain';
import { SphereRecordMapper } from './SphereRecordMapper';

describe('SphereRecordMapper', () => {
  it('round-trips a sphere record', () => {
    const sphere = Sphere.create({
      id: EntityId.create('sphere-creativity'),
      name: 'Творчество',
      description: 'Рисование',
      icon: '🎨',
      color: '#6655aa',
      now: new Date('2026-08-08T08:00:00.000Z'),
    });
    const record = SphereRecordMapper.toRecord(sphere);

    expect(record.normalizedName).toBe('творчество');
    expect(SphereRecordMapper.fromRecord(record)).toMatchObject({
      name: 'Творчество',
      description: 'Рисование',
      version: 1,
    });
  });

  it('rejects a corrupted normalized name', () => {
    const sphere = Sphere.create({
      id: EntityId.create('sphere'),
      name: 'Дом',
      now: new Date('2026-08-08T08:00:00.000Z'),
    });
    const record = { ...SphereRecordMapper.toRecord(sphere), normalizedName: 'работа' };

    expect(() => SphereRecordMapper.fromRecord(record)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_record' }),
    );
  });
});
