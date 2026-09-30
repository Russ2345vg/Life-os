import { DomainError } from '../../../shared/errors/DomainError';

export type PasswordRecoveryProof =
  | { readonly email: string; readonly token: string; readonly type: 'recovery' }
  | { readonly token_hash: string; readonly type: 'recovery' };

export function parsePasswordRecoveryProof(
  value: string,
  projectUrl: string,
  email: string,
): PasswordRecoveryProof {
  const proof = value.trim();
  if (/^\d{6,10}$/.test(proof)) return { email, token: proof, type: 'recovery' };
  try {
    const link = new URL(proof);
    const query = link.searchParams;
    const tokens = [...query.getAll('token'), ...query.getAll('token_hash')];
    if (
      link.origin !== new URL(projectUrl).origin ||
      link.pathname !== '/auth/v1/verify' ||
      link.username !== '' ||
      link.password !== '' ||
      link.hash !== '' ||
      query.getAll('type').length !== 1 ||
      query.get('type') !== 'recovery' ||
      tokens.length !== 1 ||
      !/^[a-zA-Z0-9_-]{16,512}$/.test(tokens[0] ?? '') ||
      [...query.keys()].some((key) => !['token', 'token_hash', 'type', 'redirect_to'].includes(key))
    )
      throw invalidRecoveryProof();
    return { token_hash: tokens[0]!, type: 'recovery' };
  } catch {
    throw invalidRecoveryProof();
  }
}

export function invalidRecoveryProof(): DomainError {
  return new DomainError(
    'account.recovery_invalid',
    'Код или ссылка недействительны либо уже использованы. Запросите новое письмо.',
  );
}
