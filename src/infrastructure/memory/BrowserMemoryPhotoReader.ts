import type { MemoryPhotoReader } from '../../application/ports/MemoryPhotoReader';
import { MAX_MEMORY_PHOTO_BYTES, validateMemoryPhoto, type MemoryPhoto } from '../../domain/memory';
import { DomainError } from '../../shared/errors/DomainError';

export class BrowserMemoryPhotoReader implements MemoryPhotoReader {
  public async read(input: {
    readonly bytes: Uint8Array;
    readonly mimeType: string;
  }): Promise<MemoryPhoto> {
    if (
      input.bytes.byteLength < 1 ||
      input.bytes.byteLength > MAX_MEMORY_PHOTO_BYTES ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType)
    )
      throw new DomainError(
        'memory.invalid_photo',
        'Выберите JPEG, PNG или WebP размером до 5 МБ.',
      );
    const copy = new Uint8Array(input.bytes.byteLength);
    copy.set(input.bytes);
    const blob = new Blob([copy.buffer], { type: input.mimeType });
    try {
      await decodeImage(blob);
    } catch {
      throw new DomainError(
        'memory.photo_decode',
        'Не удалось открыть фотографию. Выберите другой файл.',
      );
    }
    const chunks: string[] = [];
    for (let offset = 0; offset < copy.length; offset += 32768)
      chunks.push(String.fromCharCode(...copy.subarray(offset, offset + 32768)));
    return validateMemoryPhoto({
      dataUrl: `data:${input.mimeType};base64,${btoa(chunks.join(''))}`,
      mimeType: input.mimeType,
      sizeBytes: copy.byteLength,
    });
  }
}

async function decodeImage(blob: Blob): Promise<void> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height) throw new Error('Empty bitmap.');
    } finally {
      bitmap.close();
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () =>
        image.naturalWidth && image.naturalHeight ? resolve() : reject(new Error('Empty image.'));
      image.onerror = () => reject(new Error('Invalid image.'));
      image.src = url;
    });
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}
