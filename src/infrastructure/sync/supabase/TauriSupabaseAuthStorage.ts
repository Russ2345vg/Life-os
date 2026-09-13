import type { SupportedStorage } from '@supabase/supabase-js';

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

const AUTH_SESSION_SLOT = 'supabase-auth-session';

export class TauriSupabaseAuthStorage implements SupportedStorage {
  public constructor(private readonly invoke: TauriInvoke) {}

  public async getItem(key: string): Promise<string | null> {
    assertSupabaseStorageKey(key);
    return this.invoke<string | null>('sync_auth_session_read', { slot: AUTH_SESSION_SLOT });
  }

  public async setItem(key: string, value: string): Promise<void> {
    assertSupabaseStorageKey(key);
    await this.invoke<void>('sync_auth_session_write', { slot: AUTH_SESSION_SLOT, value });
  }

  public async removeItem(key: string): Promise<void> {
    assertSupabaseStorageKey(key);
    await this.invoke<void>('sync_auth_session_delete', { slot: AUTH_SESSION_SLOT });
  }
}

function assertSupabaseStorageKey(key: string): void {
  if (!/^sb-[a-z0-9-]+-auth-token$/i.test(key)) {
    throw new Error('Unsupported technical authentication storage key.');
  }
}
