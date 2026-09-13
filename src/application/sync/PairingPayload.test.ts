import { describe, expect, it } from 'vitest';
import {
  createPairingSecret,
  parsePairingPayload,
  serializePairingPayload,
} from './PairingPayload';

const PROJECT_REF = 'oytsyvmlkngsmpevbbct';

describe('LifeOS pairing payload', () => {
  it('contains only versioned public routing data and a fresh one-time secret', async () => {
    const first = await createPairingSecret();
    const second = await createPairingSecret();
    expect(first.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(first.secretHashHex).toMatch(/^[a-f0-9]{64}$/);
    expect(first.secret).not.toBe(second.secret);

    const serialized = serializePairingPayload({
      protocol: 'lifeos-sync-pair-v1',
      projectRef: PROJECT_REF,
      inviteId: '10000000-0000-4000-8000-000000000001',
      secret: first.secret,
      trustedDeviceId: '20000000-0000-4000-8000-000000000001',
      expiresAt: '2026-09-04T00:05:00.000Z',
    });
    expect(serialized).not.toMatch(/spaceKey|privateKey|recovery|master/i);
    expect(
      parsePairingPayload(serialized, PROJECT_REF, new Date('2026-09-04T00:00:00Z')),
    ).toMatchObject({ inviteId: '10000000-0000-4000-8000-000000000001' });
  });

  it('rejects wrong projects, malformed payloads and expired invitations', async () => {
    const secret = (await createPairingSecret()).secret;
    const serialized = serializePairingPayload({
      protocol: 'lifeos-sync-pair-v1',
      projectRef: PROJECT_REF,
      inviteId: '10000000-0000-4000-8000-000000000001',
      secret,
      trustedDeviceId: '20000000-0000-4000-8000-000000000001',
      expiresAt: '2026-09-04T00:05:00.000Z',
    });
    expect(() => parsePairingPayload(serialized, 'aaaaaaaaaaaaaaaaaaaa')).toThrow(
      'Invalid LifeOS pairing payload.',
    );
    expect(() =>
      parsePairingPayload(serialized, PROJECT_REF, new Date('2026-09-04T00:06:00Z')),
    ).toThrow('Pairing invitation expired.');
    expect(() => parsePairingPayload('{', PROJECT_REF)).toThrow('Invalid LifeOS pairing payload.');
  });
});
