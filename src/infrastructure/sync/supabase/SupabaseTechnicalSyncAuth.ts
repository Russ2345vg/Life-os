import type {
  TechnicalSyncAuth,
  TechnicalSyncIdentity,
} from '../../../application/sync/ports/TechnicalSyncAuth';
import { DomainError } from '../../../shared/errors/DomainError';

interface AuthUserView {
  readonly id: string;
  readonly is_anonymous?: boolean;
}

interface AuthSessionView {
  readonly user: AuthUserView;
}

interface AuthResult<T> {
  readonly data: T;
  readonly error: Readonly<{ message: string }> | null;
}

export interface SupabaseAuthClientPort {
  readonly auth: {
    getSession(): Promise<AuthResult<{ readonly session: AuthSessionView | null }>>;
    signInAnonymously(): Promise<AuthResult<{ readonly user: AuthUserView | null }>>;
    signOut(input: { readonly scope: 'local' }): Promise<{ readonly error: unknown | null }>;
    stopAutoRefresh(): void;
  };
}

export class SupabaseTechnicalSyncAuth implements TechnicalSyncAuth {
  public constructor(private readonly client: SupabaseAuthClientPort) {}

  public async ensureIdentity(): Promise<TechnicalSyncIdentity> {
    const current = await this.client.auth.getSession();
    if (current.error !== null) throw authUnavailable(current.error);
    if (current.data.session !== null) return requireAnonymous(current.data.session.user);

    const created = await this.client.auth.signInAnonymously();
    if (created.error !== null || created.data.user === null) {
      throw authUnavailable(created.error);
    }
    return requireAnonymous(created.data.user);
  }

  public async replaceIdentity(): Promise<TechnicalSyncIdentity> {
    const current = await this.client.auth.getSession();
    if (current.error !== null) throw authUnavailable(current.error);
    if (current.data.session !== null) {
      requireAnonymous(current.data.session.user);
      const removed = await this.client.auth.signOut({ scope: 'local' });
      if (removed.error !== null) throw authUnavailable(removed.error);
    }
    const created = await this.client.auth.signInAnonymously();
    if (created.error !== null || created.data.user === null) {
      throw authUnavailable(created.error);
    }
    return requireAnonymous(created.data.user);
  }

  public async close(): Promise<void> {
    this.client.auth.stopAutoRefresh();
  }
}

function requireAnonymous(user: AuthUserView): TechnicalSyncIdentity {
  if (user.is_anonymous !== true || !isUuid(user.id)) {
    throw new DomainError(
      'sync.technical_auth_invalid',
      'Техническая идентификация устройства недоступна.',
    );
  }
  return { userId: user.id, isAnonymous: true };
}

function authUnavailable(cause: unknown): DomainError {
  return new DomainError(
    'sync.technical_auth_unavailable',
    'Не удалось установить защищённое соединение для синхронизации.',
    { cause },
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
