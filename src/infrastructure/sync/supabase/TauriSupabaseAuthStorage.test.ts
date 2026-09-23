import { describe, expect, it } from 'vitest';
import { TauriSupabaseAuthStorage, type TauriInvoke } from './TauriSupabaseAuthStorage';

describe('TauriSupabaseAuthStorage', () => {
  it('uses one native auth-only slot and never exposes a generic LifeOS secret slot', async () => {
    const calls: Array<readonly [string, Record<string, unknown> | undefined]> = [];
    const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return null as T;
    };
    const storage = new TauriSupabaseAuthStorage(invoke);

    await storage.setItem('sb-project-auth-token', 'synthetic-session');
    await storage.getItem('sb-project-auth-token');
    await storage.removeItem('sb-project-auth-token');

    expect(calls.map(([command]) => command)).toEqual([
      'sync_auth_session_write',
      'sync_auth_session_read',
      'sync_auth_session_delete',
    ]);
    expect(calls.every(([, args]) => args?.slot === 'supabase-auth-session')).toBe(true);
  });

  it('stores Supabase PKCE flow state in separate validated native slots', async () => {
    const calls: Array<readonly [string, Record<string, unknown> | undefined]> = [];
    const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return null as T;
    };
    const storage = new TauriSupabaseAuthStorage(invoke);
    const flowId = '0123456789abcdef0123456789abcdef';

    await storage.setItem(`sb-project-auth-token-flow-${flowId}-code-verifier`, 'flow-verifier');
    await storage.setItem('sb-project-auth-token-flows-code-verifier', `['${flowId}']`);
    await storage.removeItem('sb-project-auth-token-code-verifier');

    expect(calls.map(([, args]) => args?.slot)).toEqual([
      `supabase-auth-pkce-flow-${flowId}`,
      'supabase-auth-pkce-flow-index',
      'supabase-auth-pkce-legacy',
    ]);
  });

  it('rejects arbitrary storage keys fail closed', async () => {
    const invoke: TauriInvoke = async <T>() => null as T;
    const storage = new TauriSupabaseAuthStorage(invoke);
    await expect(storage.getItem('device-private-key')).rejects.toThrow(
      'Unsupported technical authentication storage key.',
    );
  });
});
