import { DomainError } from '../../../shared/errors/DomainError';

export interface SupabasePublicConfig {
  readonly url: string;
  readonly publishableKey: string;
}

export interface SupabasePublicEnvironment {
  readonly VITE_LIFEOS_SUPABASE_URL?: string | boolean;
  readonly VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY?: string | boolean;
}

export function readSupabasePublicConfig(
  environment: SupabasePublicEnvironment,
): SupabasePublicConfig | null {
  const urlValue = readEnvironmentString(environment.VITE_LIFEOS_SUPABASE_URL);
  const keyValue = readEnvironmentString(environment.VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY);
  if (urlValue === null && keyValue === null) return null;
  if (urlValue === null || keyValue === null) throw invalidConfiguration();

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw invalidConfiguration();
  }
  if (!isAllowedSupabaseEndpoint(url) || !isPublicSupabaseKey(keyValue)) {
    throw invalidConfiguration();
  }

  return {
    url: url.toString().replace(/\/$/, ''),
    publishableKey: keyValue,
  };
}

function readEnvironmentString(value: string | boolean | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isAllowedSupabaseEndpoint(url: URL): boolean {
  const managed = url.protocol === 'https:' && url.hostname.endsWith('.supabase.co');
  const loopback =
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
  return managed || loopback;
}

function isPublicSupabaseKey(value: string): boolean {
  if (value.startsWith('sb_publishable_')) return value.length >= 24;
  if (value.startsWith('sb_secret_')) return false;

  const segments = value.split('.');
  if (segments.length !== 3) return false;
  const payloadSegment = segments[1];
  if (payloadSegment === undefined) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as unknown;
    return isRecord(payload) && payload.role === 'anon';
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidConfiguration(): DomainError {
  return new DomainError(
    'sync.supabase_config_invalid',
    'Публичная конфигурация Supabase отсутствует или недопустима.',
  );
}
