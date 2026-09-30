import { describe, expect, it } from 'vitest';
import { MAX_MEMORY_PHOTO_BYTES, validateMemoryPhoto } from './MemoryPhoto';

function photo(size: number) {
  const base64 =
    'AAAA'.repeat(Math.floor(size / 3)) + (size % 3 === 1 ? 'AA==' : size % 3 === 2 ? 'AAA=' : '');
  return { dataUrl: `data:image/png;base64,${base64}`, mimeType: 'image/png', sizeBytes: size };
}

describe('MemoryPhoto', () => {
  it('accepts the exact five MiB boundary without recursive pattern matching', () => {
    expect(validateMemoryPhoto(photo(MAX_MEMORY_PHOTO_BYTES)).sizeBytes).toBe(
      MAX_MEMORY_PHOTO_BYTES,
    );
  });
  it.each([0, MAX_MEMORY_PHOTO_BYTES + 1])('rejects %i bytes', (size) => {
    expect(() => validateMemoryPhoto(photo(size))).toThrow();
  });
  it.each(['A===', 'AAAA=', 'A A=', 'AA=A', 'A'])('rejects malformed base64 %s', (base64) => {
    expect(() =>
      validateMemoryPhoto({
        dataUrl: `data:image/png;base64,${base64}`,
        mimeType: 'image/png',
        sizeBytes: 1,
      }),
    ).toThrow();
  });
});
