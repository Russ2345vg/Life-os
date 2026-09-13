import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { SupabasePublicConfig } from './SupabaseConfig';
import { withStorageTimeout } from './StorageFetch';

export interface SupabaseClientDependencies {
  readonly fetch?: typeof globalThis.fetch;
  readonly authStorage?: SupportedStorage;
}

export const LIFE_OS_SUPABASE_AUTH_OPTIONS = Object.freeze({
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
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
    global: { fetch: withStorageTimeout(dependencies.fetch ?? globalThis.fetch.bind(globalThis)) },
  });
}
