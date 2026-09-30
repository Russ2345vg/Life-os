import { describe, expect, it, vi } from 'vitest';
import { SupabaseAccountAuth, type SupabaseAccountAuthClientPort } from './SupabaseAccountAuth';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000001';

describe('SupabaseAccountAuth', () => {
  it('validates password before consuming reset proof and ignores cleanup failure after success', async () => {
    const recovered = session({ emailConfirmedAt: '2026-09-22T08:00:00.000Z' });
    const verifyOtp = vi.fn(async () => ({
      data: { user: recovered.user, session: recovered },
      error: null,
    }));
    const isolated = client({
      session: null,
      verifyOtp,
      updateUser: async () => ({ data: { user: recovered.user }, error: null }),
      signOut: async () => {
        throw new Error('cleanup unavailable');
      },
    });
    const auth = new SupabaseAccountAuth(client({ session: null }), {
      url: 'https://example.supabase.co',
      createClient: () => isolated,
    });
    await expect(
      auth.completePasswordReset({
        email: 'person@example.com',
        codeOrLink: '123456',
        newPassword: 'weak',
        expectedUserId: USER_ID,
      }),
    ).rejects.toMatchObject({ code: 'account.password_invalid' });
    expect(verifyOtp).not.toHaveBeenCalled();
    await expect(
      auth.completePasswordReset({
        email: 'person@example.com',
        codeOrLink: '123456',
        newPassword: 'correct horse battery',
        expectedUserId: USER_ID,
      }),
    ).resolves.toBeUndefined();
  });
  it('changes a reset password in an isolated session without touching main auth', async () => {
    const recovered = session({ emailConfirmedAt: '2026-09-22T08:00:00.000Z' });
    const main = client({ session: recovered });
    const verifyOtp = vi.fn(async () => ({
      data: { user: recovered.user, session: recovered },
      error: null,
    }));
    const updateUser = vi.fn(async () => ({ data: { user: recovered.user }, error: null }));
    const isolated = client({ session: null, verifyOtp, updateUser });
    const auth = new SupabaseAccountAuth(main, {
      url: 'https://example.supabase.co',
      createClient: () => isolated,
    });
    await auth.completePasswordReset({
      email: 'person@example.com',
      codeOrLink: '123456',
      newPassword: 'correct horse battery',
      expectedUserId: USER_ID,
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      token: '123456',
      type: 'recovery',
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'correct horse battery' });
    expect(main.auth.verifyOtp).not.toHaveBeenCalled();
    expect(main.auth.updateUser).not.toHaveBeenCalled();
    expect(main.auth.signOut).not.toHaveBeenCalled();
    expect(isolated.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects another recovery owner before updating password', async () => {
    const recovered = session({
      email: 'other@example.com',
      emailConfirmedAt: '2026-09-22T08:00:00.000Z',
    });
    const updateUser = vi.fn();
    const isolated = client({
      session: null,
      updateUser,
      verifyOtp: async () => ({ data: { user: recovered.user, session: recovered }, error: null }),
    });
    const auth = new SupabaseAccountAuth(client({ session: null }), {
      url: 'https://example.supabase.co',
      createClient: () => isolated,
    });
    await expect(
      auth.completePasswordReset({
        email: 'person@example.com',
        codeOrLink: '123456',
        newPassword: 'correct horse battery',
        expectedUserId: USER_ID,
      }),
    ).rejects.toMatchObject({ code: 'account.recovery_invalid' });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it('sends an existing short password unchanged instead of applying creation policy', async () => {
    const verified = session({ emailConfirmedAt: '2026-09-22T08:00:00.000Z' });
    const signInWithPassword = vi.fn(async () => ({
      data: { user: verified.user, session: verified },
      error: null,
    }));
    const auth = new SupabaseAccountAuth(client({ session: null, signInWithPassword }));
    await expect(auth.signIn('person@example.com', ' old8 ')).resolves.toMatchObject({
      emailVerified: true,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: ' old8 ',
    });
  });

  it.each([
    ['email_not_confirmed', 400, 'account.email_not_verified'],
    ['over_request_rate_limit', 429, 'account.rate_limited'],
    ['session_not_found', 401, 'account.auth_invalid'],
  ])('classifies %s without displaying the provider response', async (code, status, expected) => {
    const signInWithPassword = vi.fn(async () => ({
      data: { user: null, session: null },
      error: { code, status, message: 'private-provider-details' },
    }));
    const auth = new SupabaseAccountAuth(client({ session: null, signInWithPassword }));
    const error = await auth
      .signIn('person@example.com', 'synthetic-password')
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: expected });
    expect(JSON.stringify(error)).not.toContain('private-provider-details');
  });

  it('normalizes thrown network failures without exposing secrets', async () => {
    const auth = new SupabaseAccountAuth(
      client({
        session: null,
        signInWithPassword: async () => {
          throw new TypeError('Failed to fetch private-password');
        },
      }),
    );
    const error = await auth
      .signIn('person@example.com', 'synthetic-password')
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'account.network_error' });
    expect(JSON.stringify(error)).not.toContain('private-password');
  });
  it('parses the session id and verified normalized email from a persisted session', async () => {
    const auth = new SupabaseAccountAuth(
      client({
        session: session({
          email: '  PERSON@Example.COM ',
          emailConfirmedAt: '2026-09-22T08:00:00.000Z',
        }),
      }),
    );

    await expect(auth.current()).resolves.toEqual({
      userId: USER_ID,
      sessionId: SESSION_ID,
      email: 'person@example.com',
      emailVerified: true,
      isAnonymous: false,
    });
  });

  it('creates one anonymous session only when no persisted session exists', async () => {
    const created = session({ anonymous: true, email: null });
    const signInAnonymously = vi.fn(async () => ({
      data: { user: created.user, session: created },
      error: null,
    }));
    const auth = new SupabaseAccountAuth(client({ session: null, signInAnonymously }));

    await expect(auth.ensureAnonymous()).resolves.toEqual({
      userId: USER_ID,
      sessionId: SESSION_ID,
      email: null,
      emailVerified: false,
      isAnonymous: true,
    });
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it('normalizes email and converts the current anonymous identity without changing its session', async () => {
    const anonymous = session({ anonymous: true, email: null });
    const convertedUser = user({
      anonymous: true,
      email: 'person@example.com',
      emailConfirmedAt: null,
    });
    const updateUser = vi.fn(async () => ({ data: { user: convertedUser }, error: null }));
    const port = client({ session: anonymous, updateUser });
    const auth = new SupabaseAccountAuth(port);

    await expect(auth.beginRegistration('  PERSON@Example.COM ')).resolves.toMatchObject({
      userId: USER_ID,
      sessionId: SESSION_ID,
      email: 'person@example.com',
      emailVerified: false,
      isAnonymous: true,
    });
    expect(updateUser).toHaveBeenCalledWith({ email: 'person@example.com' });
  });

  it('converts a real anonymous Supabase session whose email field is an empty string', async () => {
    const anonymous = session({ anonymous: true, email: '' });
    const convertedUser = user({
      anonymous: true,
      email: '',
      newEmail: 'person@example.com',
      emailConfirmedAt: null,
    });
    const updateUser = vi.fn(async () => ({ data: { user: convertedUser }, error: null }));
    const auth = new SupabaseAccountAuth(client({ session: anonymous, updateUser }));

    await expect(auth.beginRegistration('person@example.com')).resolves.toMatchObject({
      email: 'person@example.com',
      emailVerified: false,
      isAnonymous: true,
    });
    expect(updateUser).toHaveBeenCalledWith({ email: 'person@example.com' });
  });

  it('removes invisible formatting and whitespace accidentally pasted into an email', async () => {
    const anonymous = session({ anonymous: true, email: null });
    const convertedUser = user({
      anonymous: true,
      email: 'person@example.com',
      emailConfirmedAt: null,
    });
    const updateUser = vi.fn(async () => ({ data: { user: convertedUser }, error: null }));
    const auth = new SupabaseAccountAuth(client({ session: anonymous, updateUser }));

    await auth.beginRegistration(' person@\u00a0example.com\u200b ');

    expect(updateUser).toHaveBeenCalledWith({ email: 'person@example.com' });
  });

  it('keeps the anonymous session current when email identity conversion conflicts', async () => {
    const anonymous = session({ anonymous: true, email: null });
    const updateUser = vi.fn(async () => ({
      data: { user: null },
      error: { code: 'user_already_exists', message: 'PERSON@Example.COM already exists' },
    }));
    const port = client({ session: anonymous, updateUser });
    const auth = new SupabaseAccountAuth(port);

    const error = await auth.beginRegistration('PERSON@Example.COM').catch((caught) => caught);

    expect(error).toMatchObject({ code: 'account.email_in_use' });
    expect(JSON.stringify(error)).not.toContain('PERSON@Example.COM');
    expect(port.auth.signOut).not.toHaveBeenCalled();
    expect(port.auth.updateUser).toHaveBeenCalledTimes(1);
    await expect(auth.current()).resolves.toMatchObject({ isAnonymous: true, email: null });
  });

  it('accepts only a six-digit email-change OTP and returns its verified session', async () => {
    const verified = session({
      email: 'person@example.com',
      emailConfirmedAt: '2026-09-22T08:00:00.000Z',
    });
    const verifyOtp = vi.fn(async () => ({
      data: { user: verified.user, session: verified },
      error: null,
    }));
    const port = client({ session: verified, verifyOtp });
    const auth = new SupabaseAccountAuth(port);

    await expect(auth.verifyEmail(' PERSON@example.com ', '123456')).resolves.toMatchObject({
      email: 'person@example.com',
      emailVerified: true,
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      token: '123456',
      type: 'email_change',
    });
    await expect(auth.verifyEmail('person@example.com', '12 456')).rejects.toMatchObject({
      code: 'account.verification_invalid',
    });
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('sets a 12-128 character password only after email verification', async () => {
    const unverified = session({
      anonymous: true,
      email: 'person@example.com',
      emailConfirmedAt: null,
    });
    const updateUser = vi.fn(async () => ({ data: { user: unverified.user }, error: null }));
    const port = client({ session: unverified, updateUser });
    const auth = new SupabaseAccountAuth(port);

    await expect(auth.setPassword('correct horse battery')).rejects.toMatchObject({
      code: 'account.email_not_verified',
    });
    await expect(auth.setPassword('short')).rejects.toMatchObject({
      code: 'account.password_invalid',
    });
    expect(updateUser).not.toHaveBeenCalled();

    const verified = session({
      email: 'person@example.com',
      emailConfirmedAt: '2026-09-22T08:00:00.000Z',
    });
    const verifiedUpdate = vi.fn(async () => ({ data: { user: verified.user }, error: null }));
    const verifiedAuth = new SupabaseAccountAuth(
      client({ session: verified, updateUser: verifiedUpdate }),
    );

    await expect(verifiedAuth.setPassword('correct horse battery')).resolves.toMatchObject({
      emailVerified: true,
      isAnonymous: false,
    });
    expect(verifiedUpdate).toHaveBeenCalledWith({ password: 'correct horse battery' });
  });

  it('signs in with normalized email and maps invalid credentials without leaking the password', async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'bad secret-value-123' },
    }));
    const auth = new SupabaseAccountAuth(client({ session: null, signInWithPassword }));

    const error = await auth
      .signIn(' PERSON@example.com ', 'secret-value-123')
      .catch((caught) => caught);

    expect(error).toMatchObject({ code: 'account.invalid_credentials' });
    expect(JSON.stringify(error)).not.toContain('secret-value-123');
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'secret-value-123',
    });
  });

  it('uses normalized email for resend and password recovery', async () => {
    const resend = vi.fn(async () => ({ data: {}, error: null }));
    const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }));
    const auth = new SupabaseAccountAuth(client({ session: null, resend, resetPasswordForEmail }));

    await auth.resendVerification(' Person@Example.COM ');
    await auth.requestPasswordReset(' Person@Example.COM ');

    expect(resend).toHaveBeenCalledWith({
      type: 'email_change',
      email: 'person@example.com',
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('person@example.com');
  });

  it('signs out only the current session and stops auto-refresh on close', async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const stopAutoRefresh = vi.fn();
    const auth = new SupabaseAccountAuth(client({ session: null, signOut, stopAutoRefresh }));

    await auth.signOutCurrent();
    await auth.close();

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(stopAutoRefresh).toHaveBeenCalledOnce();
  });

  it('rejects malformed session claims and confirmation timestamps', async () => {
    const malformedClaim = session({ tokenSessionId: 'not-a-uuid' });
    const malformedTimestamp = session({
      email: 'person@example.com',
      emailConfirmedAt: 'not-a-date',
    });

    await expect(
      new SupabaseAccountAuth(client({ session: malformedClaim })).current(),
    ).rejects.toMatchObject({ code: 'account.auth_invalid' });
    await expect(
      new SupabaseAccountAuth(client({ session: malformedTimestamp })).current(),
    ).rejects.toMatchObject({ code: 'account.auth_invalid' });
  });
});

function client(input: {
  readonly session: AuthSessionView | null;
  readonly signInAnonymously?: SupabaseAccountAuthClientPort['auth']['signInAnonymously'];
  readonly updateUser?: SupabaseAccountAuthClientPort['auth']['updateUser'];
  readonly verifyOtp?: SupabaseAccountAuthClientPort['auth']['verifyOtp'];
  readonly signInWithPassword?: SupabaseAccountAuthClientPort['auth']['signInWithPassword'];
  readonly resend?: SupabaseAccountAuthClientPort['auth']['resend'];
  readonly resetPasswordForEmail?: SupabaseAccountAuthClientPort['auth']['resetPasswordForEmail'];
  readonly signOut?: SupabaseAccountAuthClientPort['auth']['signOut'];
  readonly stopAutoRefresh?: SupabaseAccountAuthClientPort['auth']['stopAutoRefresh'];
}): SupabaseAccountAuthClientPort {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: input.session }, error: null })),
      signInAnonymously:
        input.signInAnonymously ??
        vi.fn(async () => ({ data: { user: null, session: null }, error: providerError() })),
      updateUser:
        input.updateUser ?? vi.fn(async () => ({ data: { user: null }, error: providerError() })),
      verifyOtp:
        input.verifyOtp ??
        vi.fn(async () => ({ data: { user: null, session: null }, error: providerError() })),
      signInWithPassword:
        input.signInWithPassword ??
        vi.fn(async () => ({ data: { user: null, session: null }, error: providerError() })),
      resend: input.resend ?? vi.fn(async () => ({ data: {}, error: providerError() })),
      resetPasswordForEmail:
        input.resetPasswordForEmail ?? vi.fn(async () => ({ data: {}, error: providerError() })),
      signOut: input.signOut ?? vi.fn(async () => ({ error: null })),
      stopAutoRefresh: input.stopAutoRefresh ?? vi.fn(),
    },
  };
}

interface AuthSessionView {
  readonly access_token: string;
  readonly user: AuthUserView;
}

interface AuthUserView {
  readonly id: string;
  readonly email?: string;
  readonly new_email?: string;
  readonly email_confirmed_at?: string | null;
  readonly is_anonymous?: boolean;
}

function session(
  input: {
    readonly anonymous?: boolean;
    readonly email?: string | null;
    readonly newEmail?: string;
    readonly emailConfirmedAt?: string | null;
    readonly tokenSessionId?: string;
  } = {},
): AuthSessionView {
  return {
    access_token: jwt({ session_id: input.tokenSessionId ?? SESSION_ID }),
    user: user(input),
  };
}

function user(
  input: {
    readonly anonymous?: boolean;
    readonly email?: string | null;
    readonly newEmail?: string;
    readonly emailConfirmedAt?: string | null;
  } = {},
): AuthUserView {
  return {
    id: USER_ID,
    ...(input.email === null ? {} : { email: input.email ?? 'person@example.com' }),
    ...(input.newEmail === undefined ? {} : { new_email: input.newEmail }),
    email_confirmed_at: input.emailConfirmedAt ?? null,
    is_anonymous: input.anonymous ?? false,
  };
}

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function providerError(): { readonly code: string; readonly message: string } {
  return { code: 'provider_error', message: 'synthetic provider failure' };
}
