import { expect, it } from 'vitest';
import { createLifeOsSupabaseClient } from './createLifeOsSupabaseClient';
import { SupabaseEncryptedBlobTransport } from './SupabaseEncryptedBlobTransport';

it('retries an existing immutable ciphertext through the SDK without overwriting it', async () => {
  let stored: string | null = null;
  const client = createLifeOsSupabaseClient(
    { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' },
    {
      fetch: async (_input, init) => {
        if (init?.method === 'POST') {
          if (stored !== null)
            return new Response(JSON.stringify({ error: 'exists' }), { status: 409 });
          const form = init.body as FormData;
          stored = await (form.get('') as Blob).text();
          return new Response(JSON.stringify({ Id: 'opaque', Key: 'opaque' }));
        }
        return new Response(stored);
      },
    },
  );
  const transport = new SupabaseEncryptedBlobTransport(client);
  const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/1';
  const ciphertext = JSON.stringify({
    ciphertext: 'encrypted',
    nonce: 'nonce',
    metadata: { purpose: 'attachment' },
  });
  await transport.upload('lifeos-attachments', path, ciphertext);
  await transport.upload('lifeos-attachments', path, ciphertext);
  expect(stored).toBe(ciphertext);
  await expect(
    transport.upload('lifeos-attachments', path, ciphertext.replace('encrypted', 'other')),
  ).rejects.toThrow();
  expect(stored).toBe(ciphertext);
  await expect(
    transport.upload('lifeos-attachments', path, JSON.stringify({ dataUrl: 'private' })),
  ).rejects.toThrow('Ciphertext required');
});
