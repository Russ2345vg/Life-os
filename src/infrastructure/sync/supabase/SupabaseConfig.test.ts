import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/errors/DomainError';
import { readSupabasePublicConfig } from './SupabaseConfig';

const PUBLIC_KEY = 'sb_publishable_public-test-value';

describe('readSupabasePublicConfig', () => {
  it('keeps Supabase disabled when both public values are absent', () => {
    expect(readSupabasePublicConfig({})).toBeNull();
    expect(
      readSupabasePublicConfig({
        VITE_LIFEOS_SUPABASE_URL: '',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: '',
      }),
    ).toBeNull();
  });

  it('fails closed for partial configuration without echoing the public key', () => {
    expectConfigError({ VITE_LIFEOS_SUPABASE_URL: 'https://example.supabase.co' });
    expectConfigError({ VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY });
  });

  it('accepts managed HTTPS and local loopback Supabase endpoints only', () => {
    expect(
      readSupabasePublicConfig({
        VITE_LIFEOS_SUPABASE_URL: 'https://example.supabase.co/',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY,
      }),
    ).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: PUBLIC_KEY,
    });
    expect(
      readSupabasePublicConfig({
        VITE_LIFEOS_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY,
      }),
    ).toEqual({
      url: 'http://127.0.0.1:54321',
      publishableKey: PUBLIC_KEY,
    });
    expectConfigError({
      VITE_LIFEOS_SUPABASE_URL: 'http://example.supabase.co',
      VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY,
    });
    expectConfigError({
      VITE_LIFEOS_SUPABASE_URL: 'https://example.invalid',
      VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY,
    });
  });

  it('rejects secret/service-role values and accepts only public key forms', () => {
    const url = 'https://example.supabase.co';
    expectConfigError({
      VITE_LIFEOS_SUPABASE_URL: url,
      VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-ship-this-value',
    });
    expectConfigError({
      VITE_LIFEOS_SUPABASE_URL: url,
      VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY:
        'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
    });
    expect(
      readSupabasePublicConfig({
        VITE_LIFEOS_SUPABASE_URL: 'http://localhost:54321',
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature',
      }),
    ).toMatchObject({ url: 'http://localhost:54321' });
  });
});

function expectConfigError(environment: Readonly<Record<string, string | undefined>>): void {
  try {
    readSupabasePublicConfig(environment);
    throw new Error('Expected Supabase configuration to be rejected.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('sync.supabase_config_invalid');
    expect((error as Error).message).not.toContain(PUBLIC_KEY);
  }
}
