import { DomainError } from '../../shared/errors/DomainError';

export const MAX_MEMORY_PHOTO_BYTES = 5 * 1024 * 1024;

export interface MemoryPhoto {
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export function validateMemoryPhoto(value: unknown): MemoryPhoto {
  if (typeof value !== 'object' || value === null) throw invalidPhoto();
  if (!('dataUrl' in value) || !('mimeType' in value) || !('sizeBytes' in value))
    throw invalidPhoto();
  if (
    typeof value.dataUrl !== 'string' ||
    typeof value.mimeType !== 'string' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType) ||
    !Number.isSafeInteger(value.sizeBytes) ||
    Number(value.sizeBytes) < 1 ||
    Number(value.sizeBytes) > MAX_MEMORY_PHOTO_BYTES
  )
    throw invalidPhoto();
  const prefix = `data:${value.mimeType};base64,`;
  if (!value.dataUrl.startsWith(prefix)) throw invalidPhoto();
  const base64 = value.dataUrl.slice(prefix.length);
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalidPhoto();
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if ((base64.length / 4) * 3 - padding !== value.sizeBytes) throw invalidPhoto();
  return { dataUrl: value.dataUrl, mimeType: value.mimeType, sizeBytes: Number(value.sizeBytes) };
}

function invalidPhoto(): DomainError {
  return new DomainError(
    'memory.invalid_photo',
    'Выберите фотографию JPEG, PNG или WebP размером до 5 МБ.',
  );
}
