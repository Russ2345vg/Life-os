import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { SupabasePublicConfig } from './SupabaseConfig';
import { withSupabaseRequestTimeout } from './StorageFetch';

export interface SupabaseClientDependencies {
  readonly fetch?: typeof globalThis.fetch;
  readonly authStorage?: SupportedStorage;
}

export const LIFE_OS_SUPABASE_AUTH_OPTIONS = Object.freeze({
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
  flowType: 'pkce' as const,
});

export function createLifeOsSupabaseClient(
  config: SupabasePublicConfig,
  dependencies: SupabaseClientDependencies = {},
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      ...LIFE_OS_SUPABASE_AUTH_OPTIONS,
      ...(dependencies.authStorage === undefined ? {} : { storage: dependencies.authStorage }),
    },
    global: {
      fetch: withSupabaseRequestTimeout(dependencies.fetch ?? globalThis.fetch.bind(globalThis)),
    },
  });
}

export function createPasswordRecoveryClient(
  config: SupabasePublicConfig,
  dependencies: Pick<SupabaseClientDependencies, 'fetch'> = {},
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `lifeos-password-recovery-${globalThis.crypto.randomUUID()}`,
    },
    global: {
      fetch: withSupabaseRequestTimeout(dependencies.fetch ?? globalThis.fetch.bind(globalThis)),
    },
  });
}
