const PAIRING_PROTOCOL = 'lifeos-sync-pair-v1';
const SECRET_BYTES = 32;

export interface PairingPayload {
  readonly protocol: typeof PAIRING_PROTOCOL;
  readonly projectRef: string;
  readonly inviteId: string;
  readonly secret: string;
  readonly trustedDeviceId: string;
  readonly expiresAt: string;
}

export async function createPairingSecret(crypto: Crypto = globalThis.crypto): Promise<{
  readonly secret: string;
  readonly secretHashHex: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { secret: toHex(bytes), secretHashHex: toHex(new Uint8Array(digest)) };
}

export function serializePairingPayload(payload: PairingPayload): string {
  validate(payload, payload.projectRef);
  return JSON.stringify(payload);
}

export function parsePairingPayload(
  serialized: string,
  expectedProjectRef: string,
  now: Date = new Date(),
): PairingPayload {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw invalidPayload();
  }
  if (!isRecord(value)) throw invalidPayload();
  const payload: PairingPayload = {
    protocol: value.protocol as typeof PAIRING_PROTOCOL,
    projectRef: value.projectRef as string,
    inviteId: value.inviteId as string,
    secret: value.secret as string,
    trustedDeviceId: value.trustedDeviceId as string,
    expiresAt: value.expiresAt as string,
  };
  validate(payload, expectedProjectRef);
  if (Date.parse(payload.expiresAt) <= now.getTime())
    throw new Error('Pairing invitation expired.');
  return payload;
}

function validate(payload: PairingPayload, expectedProjectRef: string): void {
  if (
    payload.protocol !== PAIRING_PROTOCOL ||
    payload.projectRef !== expectedProjectRef ||
    !/^[a-z]{20}$/.test(payload.projectRef) ||
    !isUuid(payload.inviteId) ||
    !isUuid(payload.trustedDeviceId) ||
    !/^[a-f0-9]{64}$/.test(payload.secret) ||
    Number.isNaN(Date.parse(payload.expiresAt))
  ) {
    throw invalidPayload();
  }
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPayload(): Error {
  return new Error('Invalid LifeOS pairing payload.');
}
