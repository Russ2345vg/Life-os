import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MEMORY_PHOTO_BYTES } from '../../domain/memory';
import { BrowserMemoryPhotoReader } from './BrowserMemoryPhotoReader';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('browser memory photo reader', () => {
  it.each([true, false])(
    'revokes the fallback object URL after decoding succeeds=%s',
    async (success) => {
      vi.stubGlobal('createImageBitmap', undefined);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:memory-test');
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.stubGlobal(
        'Image',
        class {
          naturalWidth = 1;
          naturalHeight = 1;
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          set src(_value: string) {
            if (success) this.onload?.();
            else this.onerror?.();
          }
          removeAttribute() {}
        },
      );
      const result = new BrowserMemoryPhotoReader().read({
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
      });
      if (success) await expect(result).resolves.toMatchObject({ sizeBytes: 1 });
      else await expect(result).rejects.toMatchObject({ code: 'memory.photo_decode' });
      expect(revoke).toHaveBeenCalledWith('blob:memory-test');
    },
  );
  it('validates size and format before allocating decoder resources', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const reader = new BrowserMemoryPhotoReader();
    for (const bytes of [new Uint8Array(0), new Uint8Array(MAX_MEMORY_PHOTO_BYTES + 1)])
      await expect(reader.read({ bytes, mimeType: 'image/png' })).rejects.toMatchObject({
        code: 'memory.invalid_photo',
      });
    await expect(
      reader.read({ bytes: new Uint8Array([1]), mimeType: 'image/heic' }),
    ).rejects.toMatchObject({ code: 'memory.invalid_photo' });
    expect(decode).not.toHaveBeenCalled();
  });
  it('closes the decoded bitmap and returns original bytes without conversion', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1, height: 1, close })),
    );
    expect(
      await new BrowserMemoryPhotoReader().read({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
      }),
    ).toEqual({ dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', sizeBytes: 3 });
    expect(close).toHaveBeenCalledOnce();
  });
  it('reports a damaged file without returning a replacement photo', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode');
      }),
    );
    await expect(
      new BrowserMemoryPhotoReader().read({ bytes: new Uint8Array([1]), mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: 'memory.photo_decode' });
  });
});
