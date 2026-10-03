import type { SupportedStorage } from '@supabase/supabase-js';
import { DomainError } from '../../../shared/errors/DomainError';

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

const AUTH_SESSION_SLOT = 'supabase-auth-session';
const AUTH_USER_SLOT = 'supabase-auth-user';
const AUTH_PKCE_FLOW_SLOT_PREFIX = 'supabase-auth-pkce-flow-';
const AUTH_PKCE_FLOW_INDEX_SLOT = 'supabase-auth-pkce-flow-index';
const AUTH_PKCE_LEGACY_SLOT = 'supabase-auth-pkce-legacy';

export class TauriSupabaseAuthStorage implements SupportedStorage {
  public constructor(private readonly invoke: TauriInvoke) {}

  public async getItem(key: string): Promise<string | null> {
    const slot = nativeSlotForSupabaseKey(key);
    try {
      return await this.invoke<string | null>('sync_auth_session_read', { slot });
    } catch (reason: unknown) {
      if (
        reason === 'Windows secure storage decryption failed.' &&
        (slot === AUTH_SESSION_SLOT || slot === AUTH_USER_SLOT)
      )
        return null;
      throw storageFailed();
    }
  }

  public async setItem(key: string, value: string): Promise<void> {
    await this.callNative<void>('sync_auth_session_write', {
      slot: nativeSlotForSupabaseKey(key),
      value,
    });
  }

  public async removeItem(key: string): Promise<void> {
    await this.callNative<void>('sync_auth_session_delete', {
      slot: nativeSlotForSupabaseKey(key),
    });
  }
  private async callNative<T>(command: string, args: Record<string, unknown>): Promise<T> {
    try {
      return await this.invoke<T>(command, args);
    } catch {
      throw storageFailed();
    }
  }
}

function storageFailed(): DomainError {
  return new DomainError(
    'account.session_storage_failed',
    'Не удалось открыть защищённое хранилище входа. Перезапустите приложение и повторите.',
  );
}

function nativeSlotForSupabaseKey(key: string): string {
  if (/^sb-[a-z0-9-]+-auth-token$/i.test(key)) return AUTH_SESSION_SLOT;
  if (/^sb-[a-z0-9-]+-auth-token-user$/i.test(key)) return AUTH_USER_SLOT;
  const flow = /^sb-[a-z0-9-]+-auth-token-flow-([a-f0-9]{32})-code-verifier$/i.exec(key);
  if (flow?.[1] !== undefined) return `${AUTH_PKCE_FLOW_SLOT_PREFIX}${flow[1].toLowerCase()}`;
  if (/^sb-[a-z0-9-]+-auth-token-flows-code-verifier$/i.test(key)) {
    return AUTH_PKCE_FLOW_INDEX_SLOT;
  }
  if (/^sb-[a-z0-9-]+-auth-token-code-verifier$/i.test(key)) return AUTH_PKCE_LEGACY_SLOT;
  throw new Error('Unsupported technical authentication storage key.');
}
