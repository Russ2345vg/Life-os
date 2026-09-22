import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLifeOsSupabaseClient,
  LIFE_OS_SUPABASE_AUTH_OPTIONS,
} from './createLifeOsSupabaseClient';

describe('createLifeOsSupabaseClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('constructs an on-demand client without auth, realtime or fetch traffic', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('SYNC-01 must not perform a request.');
    });
    const webSocketSpy = vi.fn();
    vi.stubGlobal('WebSocket', webSocketSpy);

    const client = createLifeOsSupabaseClient(
      {
        url: 'https://example.supabase.co',
        publishableKey: 'sb_publishable_public-test-value',
        accountSyncEnabled: false,
      },
      { fetch: fetchSpy },
    );
    await Promise.resolve();

    expect(client).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();
    expect(LIFE_OS_SUPABASE_AUTH_OPTIONS).toEqual({
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    });
  });
});
