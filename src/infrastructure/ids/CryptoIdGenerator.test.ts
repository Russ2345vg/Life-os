import { describe, expect, it } from 'vitest';
import { CryptoIdGenerator } from './CryptoIdGenerator';

describe('CryptoIdGenerator', () => {
  it('создаёт уникальные непустые идентификаторы', () => {
    const generator = new CryptoIdGenerator();
    const firstId = generator.generate();
    const secondId = generator.generate();

    expect(firstId.value).not.toHaveLength(0);
    expect(firstId.equals(secondId)).toBe(false);
  });
});
