import type { MemoryPhoto } from '../../domain/memory';

export interface MemoryPhotoReader {
  read(input: { readonly bytes: Uint8Array; readonly mimeType: string }): Promise<MemoryPhoto>;
}
