import { describe, expect, it } from 'vitest';
import { EntityId } from './EntityId';

describe('EntityId', () => {
  it('создаёт идентификатор из непустой строки', () => {
    const id = EntityId.create('  day-1  ');

    expect(id.value).toBe('day-1');
    expect(id.toString()).toBe('day-1');
  });

  it('сравнивает идентификаторы по значению', () => {
    expect(EntityId.create('same').equals(EntityId.create('same'))).toBe(true);
    expect(EntityId.create('first').equals(EntityId.create('second'))).toBe(false);
  });

  it('отклоняет пустое значение', () => {
    expect(() => EntityId.create('   ')).toThrow(TypeError);
  });
});
