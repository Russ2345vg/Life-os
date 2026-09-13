import type {
  SyncBinaryCrypto,
  SyncBinaryMetadata,
  SyncBinaryEnvelope,
} from './AttachmentContracts';
export async function sha256(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
export async function protect(
  crypto: SyncBinaryCrypto,
  metadata: SyncBinaryMetadata,
  value: unknown,
): Promise<string> {
  const payload = JSON.stringify(value);
  return JSON.stringify(
    await crypto.encryptBinary(
      metadata,
      JSON.stringify({ payload, integrity: await sha256(payload) }),
    ),
  );
}
export async function unprotect(
  crypto: SyncBinaryCrypto,
  metadata: SyncBinaryMetadata,
  encrypted: string,
): Promise<unknown> {
  if (encrypted.length > 96 * 1024 * 1024) throw new Error('Protected payload exceeds limit.');
  const envelope = JSON.parse(encrypted) as SyncBinaryEnvelope;
  if (
    !envelope.metadata ||
    Object.entries(metadata).some(([key, value]) => Reflect.get(envelope.metadata, key) !== value)
  )
    throw new Error('Protected payload context mismatch.');
  const decoded = JSON.parse(await crypto.decryptBinary(envelope)) as {
    payload: string;
    integrity: string;
  };
  if (typeof decoded.payload !== 'string' || (await sha256(decoded.payload)) !== decoded.integrity)
    throw new Error('Protected payload integrity mismatch.');
  return JSON.parse(decoded.payload) as unknown;
}
