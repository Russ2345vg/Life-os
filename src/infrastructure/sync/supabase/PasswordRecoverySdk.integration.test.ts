import { expect, it } from 'vitest';
import {
  createLifeOsSupabaseClient,
  createPasswordRecoveryClient,
} from './createLifeOsSupabaseClient';
import { SupabaseAccountAuth } from './SupabaseAccountAuth';
import { TauriSupabaseAuthStorage } from './TauriSupabaseAuthStorage';

it('completes standard email-link reset with the installed SDK without changing persisted main session', async () => {
  const user = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'person@example.com',
    email_confirmed_at: '2026-09-22T08:00:00Z',
    is_anonymous: false,
    aud: 'authenticated',
  };
  const jwt = (id: string) =>
    `e30.${btoa(JSON.stringify({ session_id: id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  const initial = JSON.stringify({
    access_token: jwt('20000000-0000-4000-8000-000000000001'),
    refresh_token: 'synthetic-main-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  });
  const writes: string[] = [];
  const storage = new TauriSupabaseAuthStorage(async <T>(command: string) => {
    if (command !== 'sync_auth_session_read') writes.push(command);
    return (command === 'sync_auth_session_read' ? initial : null) as T;
  });
  const requests: Array<{ path: string; method: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    requests.push({ path, method: init?.method ?? 'GET' });
    if (path.endsWith('/verify'))
      return Response.json({
        access_token: jwt('20000000-0000-4000-8000-000000000002'),
        refresh_token: 'synthetic-recovery-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user,
      });
    if (path.endsWith('/user')) return Response.json(user);
    if (path.endsWith('/logout')) return new Response(null, { status: 204 });
    throw new Error('Unexpected SDK request');
  };
  const config = {
    url: 'https://reset-sdk.supabase.co',
    publishableKey: 'sb_publishable_synthetic',
    accountSyncEnabled: true,
  };
  const main = createLifeOsSupabaseClient(config, { authStorage: storage, fetch: fetcher });
  const auth = new SupabaseAccountAuth(main, {
    url: config.url,
    createClient: () => createPasswordRecoveryClient(config, { fetch: fetcher }),
  });
  try {
    const before = await auth.current();
    await auth.completePasswordReset({
      email: user.email,
      codeOrLink: `${config.url}/auth/v1/verify?type=recovery&token=pkce_${'a'.repeat(56)}`,
      newPassword: 'correct horse battery',
      expectedUserId: user.id,
    });
    expect(await auth.current()).toEqual(before);
    expect(writes).toEqual([]);
    expect(requests).toEqual([
      { path: '/auth/v1/verify', method: 'POST' },
      { path: '/auth/v1/user', method: 'PUT' },
      { path: '/auth/v1/logout', method: 'POST' },
    ]);
  } finally {
    await auth.close();
  }
});
