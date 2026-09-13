import { describe, expect, it, vi } from 'vitest';
import {
  SupabaseTechnicalSyncAuth,
  type SupabaseAuthClientPort,
} from './SupabaseTechnicalSyncAuth';

const USER_ID = '10000000-0000-4000-8000-000000000001';

describe('SupabaseTechnicalSyncAuth', () => {
  it('reuses one persisted anonymous technical identity', async () => {
    const signInMock = vi.fn(async () => ({ data: { user: null }, error: null }));
    const signInAnonymously: SupabaseAuthClientPort['auth']['signInAnonymously'] = signInMock;
    const auth = new SupabaseTechnicalSyncAuth(
      client({ session: { user: { id: USER_ID, is_anonymous: true } }, signInAnonymously }),
    );
    await expect(auth.ensureIdentity()).resolves.toEqual({ userId: USER_ID, isAnonymous: true });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('creates an anonymous identity only when no session exists', async () => {
    const signInMock = vi.fn(async () => ({
      data: { user: { id: USER_ID, is_anonymous: true } },
      error: null,
    }));
    const signInAnonymously: SupabaseAuthClientPort['auth']['signInAnonymously'] = signInMock;
    const auth = new SupabaseTechnicalSyncAuth(client({ session: null, signInAnonymously }));
    await expect(auth.ensureIdentity()).resolves.toEqual({ userId: USER_ID, isAnonymous: true });
    expect(signInMock).toHaveBeenCalledOnce();
  });

  it('rejects non-anonymous sessions and hides provider details from the public error', async () => {
    const auth = new SupabaseTechnicalSyncAuth(
      client({ session: { user: { id: USER_ID, is_anonymous: false } } }),
    );
    await expect(auth.ensureIdentity()).rejects.toMatchObject({
      code: 'sync.technical_auth_invalid',
    });
  });

  it('replaces only the local anonymous technical identity for safe device re-enrollment', async () => {
    const replacementId = '10000000-0000-4000-8000-000000000002';
    const signOut = vi.fn(async () => ({ error: null }));
    const signInAnonymously = vi.fn(async () => ({
      data: { user: { id: replacementId, is_anonymous: true } },
      error: null,
    }));
    const port = client({
      session: { user: { id: USER_ID, is_anonymous: true } },
      signInAnonymously,
      signOut,
    });
    const auth = new SupabaseTechnicalSyncAuth(port);

    await expect(auth.replaceIdentity()).resolves.toEqual({
      userId: replacementId,
      isAnonymous: true,
    });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it('does not create a replacement identity when local sign-out fails', async () => {
    const signInAnonymously = vi.fn(async () => ({ data: { user: null }, error: null }));
    const auth = new SupabaseTechnicalSyncAuth(
      client({
        session: { user: { id: USER_ID, is_anonymous: true } },
        signInAnonymously,
        signOut: vi.fn(async () => ({ error: { message: 'synthetic sign-out failure' } })),
      }),
    );

    await expect(auth.replaceIdentity()).rejects.toMatchObject({
      code: 'sync.technical_auth_unavailable',
    });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});

function client(input: {
  readonly session: {
    readonly user: { readonly id: string; readonly is_anonymous: boolean };
  } | null;
  readonly signInAnonymously?: SupabaseAuthClientPort['auth']['signInAnonymously'];
  readonly signOut?: SupabaseAuthClientPort['auth']['signOut'];
}): SupabaseAuthClientPort {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: input.session }, error: null })),
      signInAnonymously:
        input.signInAnonymously ??
        vi.fn(async () => ({ data: { user: null }, error: { message: 'synthetic failure' } })),
      signOut: input.signOut ?? vi.fn(async () => ({ error: null })),
      stopAutoRefresh: vi.fn(),
    },
  };
}
