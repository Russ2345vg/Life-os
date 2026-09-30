import { expect, it } from 'vitest';
import { parsePasswordRecoveryProof } from './PasswordRecoveryProof';

it('accepts numeric codes and the unconsumed standard recovery link including PKCE hashes', () => {
  expect(
    parsePasswordRecoveryProof('123456', 'https://example.supabase.co', 'person@example.com'),
  ).toEqual({ email: 'person@example.com', token: '123456', type: 'recovery' });
  const hash = `pkce_${'a'.repeat(56)}`;
  expect(
    parsePasswordRecoveryProof(
      `https://example.supabase.co/auth/v1/verify?type=recovery&token=${hash}&redirect_to=https%3A%2F%2Flifeos.app`,
      'https://example.supabase.co',
      'person@example.com',
    ),
  ).toEqual({ token_hash: hash, type: 'recovery' });
});

it.each([
  'https://evil.example/auth/v1/verify?type=recovery&token=aaaaaaaaaaaaaaaa',
  'https://example.supabase.co/auth/v1/verify?type=signup&token=aaaaaaaaaaaaaaaa',
  'https://example.supabase.co/auth/v1/verify?type=recovery&token=a&token=b',
  'https://example.supabase.co/auth/v1/verify?type=recovery&token=aaaaaaaaaaaaaaaa&token_hash=bbbbbbbbbbbbbbbb',
  'https://example.supabase.co/#access_token=secret',
])('rejects an unsafe or consumed callback link', (link) => {
  expect(() =>
    parsePasswordRecoveryProof(link, 'https://example.supabase.co', 'person@example.com'),
  ).toThrow('Код или ссылка');
});
