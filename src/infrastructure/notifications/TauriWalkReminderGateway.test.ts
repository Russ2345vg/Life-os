import { describe, expect, it } from 'vitest';
import { TauriWalkReminderGateway } from './TauriWalkReminderGateway';

describe('walk reminder gateway', () => {
  it('reports browser unsupported rather than faking a scheduled notification', async () => {
    expect((await new TauriWalkReminderGateway(undefined, () => false).status()).state).toBe(
      'unsupported',
    );
  });
  it('rejects malformed native scheduled status', async () => {
    await expect(
      new TauriWalkReminderGateway(
        async () => ({ state: 'scheduled', revision: 1 }),
        () => true,
      ).status(),
    ).rejects.toThrow();
  });
});
