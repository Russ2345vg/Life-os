import type { AccountAuth, AccountSession } from '../../../application/sync/account/AccountAuth';
import { DomainError } from '../../../shared/errors/DomainError';

interface AuthUserView {
  readonly id: string;
  readonly email?: string;
  readonly email_confirmed_at?: string | null;
  readonly confirmed_at?: string | null;
  readonly is_anonymous?: boolean;
}

interface AuthSessionView {
  readonly access_token: string;
  readonly user: AuthUserView;
}

interface AuthErrorView {
  readonly code?: string | undefined;
  readonly message: string;
}

interface AuthResult<T> {
  readonly data: T;
  readonly error: AuthErrorView | null;
}

export interface SupabaseAccountAuthClientPort {
  readonly auth: {
    getSession(): Promise<AuthResult<{ readonly session: AuthSessionView | null }>>;
    signInAnonymously(): Promise<
      AuthResult<{
        readonly user: AuthUserView | null;
        readonly session: AuthSessionView | null;
      }>
    >;
    updateUser(input: {
      readonly email?: string;
      readonly password?: string;
    }): Promise<AuthResult<{ readonly user: AuthUserView | null }>>;
    verifyOtp(input: {
      readonly email: string;
      readonly token: string;
      readonly type: 'email_change';
    }): Promise<
      AuthResult<{
        readonly user: AuthUserView | null;
        readonly session: AuthSessionView | null;
      }>
    >;
    signInWithPassword(input: { readonly email: string; readonly password: string }): Promise<
      AuthResult<{
        readonly user: AuthUserView | null;
        readonly session: AuthSessionView | null;
      }>
    >;
    resend(input: {
      readonly type: 'email_change';
      readonly email: string;
    }): Promise<AuthResult<unknown>>;
    resetPasswordForEmail(email: string): Promise<AuthResult<unknown>>;
    signOut(input: { readonly scope: 'local' }): Promise<{ readonly error: AuthErrorView | null }>;
    stopAutoRefresh(): void;
  };
}

export class SupabaseAccountAuth implements AccountAuth {
  public constructor(private readonly client: SupabaseAccountAuthClientPort) {}

  public async current(): Promise<AccountSession | null> {
    const result = await this.client.auth.getSession();
    if (result.error !== null) throw authUnavailable();
    return result.data.session === null ? null : parseSession(result.data.session);
  }

  public async ensureAnonymous(): Promise<AccountSession> {
    const current = await this.providerSession();
    if (current !== null) return parseSession(current);

    const created = await this.client.auth.signInAnonymously();
    if (created.error !== null || created.data.session === null) throw authUnavailable();
    return parseSession(created.data.session);
  }

  public async beginRegistration(email: string): Promise<AccountSession> {
    const normalized = normalizeEmail(email);
    const current = await this.providerSessionOrAnonymous();
    const parsed = parseSession(current);
    if (!parsed.isAnonymous) {
      throw new DomainError(
        'account.registration_invalid',
        'Текущая сессия уже связана с аккаунтом.',
      );
    }

    const updated = await this.client.auth.updateUser({ email: normalized });
    if (updated.error !== null) throw mapProviderError(updated.error, 'registration');
    if (updated.data.user === null) throw authInvalid();
    return parseSession({ ...current, user: updated.data.user });
  }

  public async resendVerification(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const result = await this.client.auth.resend({
      type: 'email_change',
      email: normalized,
    });
    if (result.error !== null) throw mapProviderError(result.error, 'verification');
  }

  public async verifyEmail(email: string, token: string): Promise<AccountSession> {
    const normalized = normalizeEmail(email);
    if (!/^\d{6}$/.test(token)) throw verificationInvalid();
    const result = await this.client.auth.verifyOtp({
      email: normalized,
      token,
      type: 'email_change',
    });
    if (result.error !== null) throw mapProviderError(result.error, 'verification');
    if (result.data.session === null) throw authInvalid();
    const session = parseSession(result.data.session);
    if (session.email !== normalized || !session.emailVerified) throw verificationInvalid();
    return session;
  }

  public async setPassword(password: string): Promise<AccountSession> {
    return this.savePassword(password);
  }

  public async signIn(email: string, password: string): Promise<AccountSession> {
    const normalized = normalizeEmail(email);
    requirePassword(password);
    const result = await this.client.auth.signInWithPassword({ email: normalized, password });
    if (result.error !== null) throw mapProviderError(result.error, 'sign_in');
    if (result.data.session === null) throw authInvalid();
    const session = parseSession(result.data.session);
    if (session.isAnonymous || session.email !== normalized) throw authInvalid();
    return session;
  }

  public async requestPasswordReset(email: string): Promise<void> {
    const result = await this.client.auth.resetPasswordForEmail(normalizeEmail(email));
    if (result.error !== null) throw authUnavailable();
  }

  public async updatePassword(password: string): Promise<AccountSession> {
    return this.savePassword(password);
  }

  public async signOutCurrent(): Promise<void> {
    const result = await this.client.auth.signOut({ scope: 'local' });
    if (result.error !== null) throw authUnavailable();
  }

  public async close(): Promise<void> {
    this.client.auth.stopAutoRefresh();
  }

  private async savePassword(password: string): Promise<AccountSession> {
    requirePassword(password);
    const current = await this.providerSession();
    if (current === null) throw authInvalid();
    const parsed = parseSession(current);
    if (parsed.email === null || !parsed.emailVerified) {
      throw new DomainError(
        'account.email_not_verified',
        'Сначала подтвердите адрес электронной почты.',
      );
    }

    const updated = await this.client.auth.updateUser({ password });
    if (updated.error !== null) throw authUnavailable();
    if (updated.data.user === null) throw authInvalid();
    const session = parseSession({ ...current, user: updated.data.user });
    if (session.isAnonymous || !session.emailVerified) throw authInvalid();
    return session;
  }

  private async providerSession(): Promise<AuthSessionView | null> {
    const result = await this.client.auth.getSession();
    if (result.error !== null) throw authUnavailable();
    return result.data.session;
  }

  private async providerSessionOrAnonymous(): Promise<AuthSessionView> {
    const current = await this.providerSession();
    if (current !== null) return current;
    const created = await this.client.auth.signInAnonymously();
    if (created.error !== null || created.data.session === null) throw authUnavailable();
    return created.data.session;
  }
}

function parseSession(session: AuthSessionView): AccountSession {
  if (!isUuid(session.user.id)) throw authInvalid();
  if (session.user.is_anonymous !== undefined && typeof session.user.is_anonymous !== 'boolean') {
    throw authInvalid();
  }

  const claims = decodeJwtPayload(session.access_token);
  const sessionId = claims.session_id;
  if (typeof sessionId !== 'string' || !isUuid(sessionId)) throw authInvalid();

  const email = session.user.email === undefined ? null : normalizeEmail(session.user.email);
  const confirmedAt = session.user.email_confirmed_at ?? session.user.confirmed_at ?? null;
  if (confirmedAt !== null && !isTimestamp(confirmedAt)) throw authInvalid();

  return {
    userId: session.user.id,
    sessionId,
    email,
    emailVerified: email !== null && confirmedAt !== null,
    isAnonymous: session.user.is_anonymous === true,
  };
}

function decodeJwtPayload(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split('.')[1];
  if (payload === undefined || payload.length === 0) throw authInvalid();
  try {
    const base64 = payload.replaceAll('-', '+').replaceAll('_', '/');
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const value: unknown = JSON.parse(decoded);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw authInvalid();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw authInvalid();
  }
}

function normalizeEmail(value: string): string {
  const normalized = value.replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, '').toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new DomainError('account.email_invalid', 'Укажите корректный адрес электронной почты.');
  }
  return normalized;
}

function requirePassword(value: string): void {
  if (value.length < 12 || value.length > 128) {
    throw new DomainError(
      'account.password_invalid',
      'Пароль должен содержать от 12 до 128 символов.',
    );
  }
}

function mapProviderError(
  error: AuthErrorView,
  operation: 'registration' | 'verification' | 'sign_in',
): DomainError {
  const code = error.code?.toLowerCase() ?? '';
  if (
    operation === 'registration' &&
    ['email_exists', 'identity_already_exists', 'user_already_exists'].includes(code)
  ) {
    return new DomainError('account.email_in_use', 'Этот адрес уже связан с другим аккаунтом.');
  }
  if (operation === 'verification') return verificationInvalid();
  if (operation === 'sign_in' && code === 'invalid_credentials') {
    return new DomainError(
      'account.invalid_credentials',
      'Неверный адрес электронной почты или пароль.',
    );
  }
  return authUnavailable();
}

function verificationInvalid(): DomainError {
  return new DomainError(
    'account.verification_invalid',
    'Код подтверждения недействителен или истёк.',
  );
}

function authUnavailable(): DomainError {
  return new DomainError('account.auth_unavailable', 'Сервис аккаунта временно недоступен.');
}

function authInvalid(): DomainError {
  return new DomainError('account.auth_invalid', 'Сессия аккаунта повреждена или устарела.');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}
