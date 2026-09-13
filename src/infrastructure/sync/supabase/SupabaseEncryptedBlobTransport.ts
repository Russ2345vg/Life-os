import type { SupabaseClient } from '@supabase/supabase-js';
import type { EncryptedBlobTransport } from '../../../application/sync/attachments/AttachmentContracts';

export class SupabaseEncryptedBlobTransport implements EncryptedBlobTransport {
  public constructor(private readonly client: SupabaseClient) {}
  public async upload(
    bucket: 'lifeos-attachments' | 'lifeos-snapshots',
    path: string,
    bytes: string,
  ): Promise<void> {
    assertPath(path);
    // Reject accidental plaintext at the transport boundary. Authentication remains client-side.
    const value = JSON.parse(bytes) as Record<string, unknown>;
    if (
      typeof value.ciphertext !== 'string' ||
      typeof value.nonce !== 'string' ||
      !value.metadata ||
      Object.keys(value).some((key) => !['ciphertext', 'nonce', 'metadata'].includes(key))
    )
      throw new Error('Ciphertext required.');
    const result = await this.client.storage
      .from(bucket)
      .upload(path, new Blob([bytes], { type: 'application/octet-stream' }), {
        upsert: false,
        contentType: 'application/octet-stream',
        cacheControl: '0',
      });
    if (result.error) {
      // Includes interrupted successful uploads. Never overwrite an immutable version.
      const existing = await this.download(bucket, path);
      if (existing !== bytes) throw new Error('Protected upload failed.');
    }
  }
  public async download(
    bucket: 'lifeos-attachments' | 'lifeos-snapshots',
    path: string,
  ): Promise<string> {
    assertPath(path);
    const result = await this.client.storage
      .from(bucket)
      .download(path, undefined, { signal: AbortSignal.timeout(60_000) });
    if (result.error || !result.data || result.data.size > 96 * 1024 * 1024)
      throw new Error('Protected download unavailable.');
    return result.data.text();
  }
  public async listSnapshots(spaceId: string): Promise<readonly string[]> {
    assertPath(`${spaceId}/11111111-1111-4111-8111-111111111111/1`);
    const paths: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const result = await this.client.storage
        .from('lifeos-snapshots')
        .list(
          spaceId,
          { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } },
          { signal: AbortSignal.timeout(60_000) },
        );
      if (result.error || !result.data) throw new Error('Restore point list unavailable.');
      for (const item of result.data) {
        const path = `${spaceId}/${item.name}/1`;
        assertPath(path);
        paths.push(path);
      }
      if (result.data.length < 100) return paths;
    }
  }
}
function assertPath(path: string): void {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[1-9][0-9]*$/i.test(path))
    throw new Error('Opaque storage path required.');
}
