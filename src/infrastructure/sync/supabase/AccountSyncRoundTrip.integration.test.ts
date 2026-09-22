import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SupabaseEncryptedBlobTransport } from './SupabaseEncryptedBlobTransport';
import { SupabasePilotSyncTransport } from './SupabasePilotSyncTransport';
import { SupabaseSyncTrustTransport } from './SupabaseSyncTrustTransport';

const configuration = localConfiguration();
const runLocalRoundTrip = configuration !== null;

describe.skipIf(!runLocalRoundTrip)('local Supabase account sync round trip', () => {
  it('binds two sessions, gates encrypted data by recovery and revokes only session B', async () => {
    if (configuration === null) throw new Error('Local Supabase test configuration is missing.');
    const admin = createClient(configuration.url, configuration.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bootstrap = createClient(configuration.url, configuration.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `lifeos-sync-${crypto.randomUUID()}@example.test`;
    const anonymous = await bootstrap.auth.signInAnonymously();
    if (anonymous.error || anonymous.data.user === null) {
      throw anonymous.error ?? new Error('Anonymous user missing.');
    }
    const userId = anonymous.data.user.id;
    const promoted = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (promoted.error || promoted.data.user === null) {
      await admin.auth.admin.deleteUser(userId);
      throw promoted.error ?? new Error('Promoted user missing.');
    }
    const sessionA = crypto.randomUUID();
    const sessionB = crypto.randomUUID();
    const attachmentPath = `${crypto.randomUUID()}/${crypto.randomUUID()}/1`;

    try {
      const [clientA, clientB] = await Promise.all([
        accountClient(configuration, userId, sessionA, email),
        accountClient(configuration, userId, sessionB, email),
      ]);
      const trustA = new SupabaseSyncTrustTransport(clientA);
      const trustB = new SupabaseSyncTrustTransport(clientB);
      const pilotA = new SupabasePilotSyncTransport(clientA);
      const pilotB = new SupabasePilotSyncTransport(clientB);
      const blobsA = new SupabaseEncryptedBlobTransport(clientA);
      const blobsB = new SupabaseEncryptedBlobTransport(clientB);
      const spaceId = attachmentPath.slice(0, 36);
      const deviceA = crypto.randomUUID();
      const deviceB = crypto.randomUUID();
      const recoveryProof = crypto.getRandomValues(new Uint8Array(32));
      const recoveryCiphertext = crypto.getRandomValues(new Uint8Array(32));
      const recoveryNonce = crypto.getRandomValues(new Uint8Array(24));
      const contentKey = crypto.getRandomValues(new Uint8Array(32));

      await trustA.createFirstSpace({
        spaceId,
        deviceId: deviceA,
        publicKey: randomEncoded(32),
        encryptedDeviceName: randomEncoded(32),
        encryptedDeviceNameNonce: randomEncoded(24),
        platform: 'windows',
        recoveryAuthVerifier: encoded(await sha256(recoveryProof)),
        recoveryEnvelope: {
          metadata: {
            protocolVersion: 1,
            purpose: 'recovery',
            spaceId,
            recipientDeviceId: spaceId,
            keyEpoch: 1,
          },
          ciphertext: encoded(recoveryCiphertext),
          nonce: encoded(recoveryNonce),
        },
      });

      const records = [
        { type: 'goal', id: crypto.randomUUID(), title: 'Синхронная цель' },
        { type: 'action', id: crypto.randomUUID(), title: 'Первое действие' },
      ];
      for (const record of records) {
        await pilotA.push(
          encryptedEvent(spaceId, deviceA, record.id, 1, encrypt(record, contentKey)),
        );
      }
      const attachment = JSON.stringify({
        ciphertext: encrypt({ kind: 'attachment', text: 'opaque body' }, contentKey),
        nonce: randomEncoded(24),
        metadata: { purpose: 'attachment', keyEpoch: 1 },
      });
      await blobsA.upload('lifeos-attachments', attachmentPath, attachment);

      await expect(pilotB.pull(0, 100)).rejects.toMatchObject({
        code: 'sync.pilot_transport_denied',
      });
      await expect(blobsB.download('lifeos-attachments', attachmentPath)).rejects.toThrow();

      const challenge = await trustB.beginRecovery({
        spaceId,
        authProof: encoded(recoveryProof),
        deviceId: deviceB,
        publicKey: randomEncoded(32),
        platform: 'android',
      });
      const recoveryEnvelopeHash = await sha256Hex(
        concat(
          decoded(challenge.recoveryEnvelope.ciphertext),
          decoded(challenge.recoveryEnvelope.nonce),
        ),
      );
      await trustB.completeRecovery({
        deviceId: deviceB,
        authProof: encoded(recoveryProof),
        recoveryEnvelopeSha256Hex: recoveryEnvelopeHash,
        encryptedDeviceName: randomEncoded(32),
        encryptedDeviceNameNonce: randomEncoded(24),
      });

      const pulled = await pilotB.pull(0, 100);
      expect(pulled).toHaveLength(2);
      expect(pulled.map((event) => decrypt(event.ciphertext, contentKey))).toEqual(records);
      expect(await blobsB.download('lifeos-attachments', attachmentPath)).toBe(attachment);

      const offlineEdit = { type: 'goal', id: records[0]!.id, title: 'Изменено офлайн' };
      const cursor = Math.max(...pulled.map((event) => event.sequence));
      expect(await pilotA.pull(cursor, 100)).toEqual([]);
      await pilotB.push(
        encryptedEvent(spaceId, deviceB, offlineEdit.id, 2, encrypt(offlineEdit, contentKey), 1),
      );
      const converged = await pilotA.pull(cursor, 100);
      expect(decrypt(converged[0]!.ciphertext, contentKey)).toEqual(offlineEdit);

      await trustB.revokeCurrentDevice();
      await expect(pilotB.pull(0, 100)).rejects.toMatchObject({
        code: 'sync.pilot_transport_denied',
      });
      await expect(blobsB.download('lifeos-attachments', attachmentPath)).rejects.toThrow();
      await expect(pilotA.pull(0, 100)).resolves.toHaveLength(3);
    } finally {
      await admin.storage.from('lifeos-attachments').remove([attachmentPath]);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);
});

interface LocalConfiguration {
  readonly url: string;
  readonly publishableKey: string;
  readonly serviceRoleKey: string;
  readonly jwtSecret: string;
}

function localConfiguration(): LocalConfiguration | null {
  const values = [
    import.meta.env.VITE_LIFEOS_LOCAL_SUPABASE_URL,
    import.meta.env.VITE_LIFEOS_LOCAL_SUPABASE_PUBLISHABLE_KEY,
    import.meta.env.VITE_LIFEOS_LOCAL_SUPABASE_SERVICE_ROLE_KEY,
    import.meta.env.VITE_LIFEOS_LOCAL_SUPABASE_JWT_SECRET,
  ];
  if (!values.every((value) => typeof value === 'string' && value.length > 0)) return null;
  const [url, publishableKey, serviceRoleKey, jwtSecret] = values as string[];
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) return null;
  return {
    url: url!,
    publishableKey: publishableKey!,
    serviceRoleKey: serviceRoleKey!,
    jwtSecret: jwtSecret!,
  };
}

async function accountClient(
  config: LocalConfiguration,
  userId: string,
  sessionId: string,
  email: string,
): Promise<SupabaseClient> {
  const token = await jwt(config.jwtSecret, {
    sub: userId,
    session_id: sessionId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    is_anonymous: false,
  });
  return createClient(config.url, config.publishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function encryptedEvent(
  spaceId: string,
  deviceId: string,
  objectId: string,
  revision: number,
  ciphertext: string,
  baseRevision = 0,
) {
  return {
    metadata: {
      protocolVersion: 1 as const,
      purpose: 'pilot_event' as const,
      spaceId,
      eventId: crypto.randomUUID(),
      objectId,
      originDeviceId: deviceId,
      keyEpoch: 1,
      operation: 'upsert' as const,
      baseRevision,
      revision,
      hlcWallTime: Date.now(),
      hlcLogical: 0,
    },
    ciphertext,
    nonce: randomEncoded(24),
  };
}

function encrypt(value: object, key: Uint8Array): string {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  return encoded(plaintext.map((byte, index) => byte ^ key[index % key.length]!));
}

function decrypt(value: string, key: Uint8Array): unknown {
  const ciphertext = decoded(value);
  const plaintext = ciphertext.map((byte, index) => byte ^ key[index % key.length]!);
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
}

async function jwt(secret: string, claims: Record<string, unknown>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encoded(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = encoded(
    new TextEncoder().encode(JSON.stringify({ ...claims, iat: now, exp: now + 3600 })),
  );
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encoded(new Uint8Array(signature))}`;
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(value)));
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  return [...(await sha256(value))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}

function randomEncoded(length: number): string {
  return encoded(crypto.getRandomValues(new Uint8Array(length)));
}

function encoded(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decoded(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    (character) => character.charCodeAt(0),
  );
}
