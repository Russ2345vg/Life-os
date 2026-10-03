import { expect, it, vi } from 'vitest';
import { createLifeOsSupabaseClient } from './createLifeOsSupabaseClient';
import { withStorageTimeout } from './StorageFetch';
import { TauriSupabaseAuthStorage } from './TauriSupabaseAuthStorage';
import { SupabaseAccountAuth } from './SupabaseAccountAuth';

it.each([204, 205, 304])('preserves a bodyless HTTP %i response from Chromium', async (status) => {
  const response = new Response(null, { status });
  Object.defineProperty(response, 'body', {
    value: new ReadableStream({ start: (controller) => controller.close() }),
  });
  const fetching = withStorageTimeout(async () => response);

  await expect(fetching('https://example.supabase.co/rest/v1/rpc/complete_recovery')).resolves.toBe(
    response,
  );
});

it('bounds OpenAI function response bodies', async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    const fetching = withStorageTimeout(async () => new Response(new ReadableStream({ cancel })));
    const pending = fetching('https://example.supabase.co/functions/v1/lifeos-openai');
    const rejected = expect(pending).rejects.toThrow('LifeOS request timed out.');
    await vi.advanceTimersByTimeAsync(65_001);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('rejects oversized OpenAI function bodies', async () => {
  const fetching = withStorageTimeout(async () => new Response('x'.repeat(65_537)));
  await expect(fetching('https://example.supabase.co/functions/v1/lifeos-openai')).rejects.toThrow(
    'LifeOS response too large.',
  );
});

it('keeps the deadline until a stalled response body is cancelled', async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    const fetcher = withStorageTimeout(async () => new Response(new ReadableStream({ cancel })));
    const pending = fetcher('https://example.supabase.co/storage/v1/object/file');
    const rejected = expect(pending).rejects.toThrow('LifeOS request timed out.');
    await vi.advanceTimersByTimeAsync(60_001);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('aborts a stalled SDK Storage upload and releases the request', async () => {
  vi.useFakeTimers();
  try {
    let signal: AbortSignal | null = null;
    const client = createLifeOsSupabaseClient(
      {
        url: 'https://example.supabase.co',
        publishableKey: 'sb_publishable_test',
        accountSyncEnabled: false,
      },
      {
        fetch: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal ?? null;
            signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      },
    );
    const pending = client.storage
      .from('lifeos-attachments')
      .upload('opaque', new Blob(['ciphertext']));
    await vi.advanceTimersByTimeAsync(60_001);
    const result = await pending;
    expect(signal).not.toBeNull();
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    expect(result.error).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  ['/auth/v1/token', 20_000],
  ['/rest/v1/rpc/sync_push', 30_000],
])('aborts %s before returning a late response', async (path, timeout) => {
  vi.useFakeTimers();
  try {
    let signal: AbortSignal | null = null;
    let respond: ((response: Response) => void) | undefined;
    const fetcher = withStorageTimeout(async (_input, init) => {
      signal = init?.signal ?? null;
      return new Promise<Response>((resolve) => {
        respond = resolve;
      });
    });
    const pending = fetcher(`https://example.supabase.co${path}`);
    const rejected = expect(pending).rejects.toThrow('LifeOS request timed out.');
    await vi.advanceTimersByTimeAsync(timeout + 1);
    await rejected;
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    respond?.(new Response('{}'));
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('cancels stalled auth bodies and preserves caller cancellation', async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    const fetcher = withStorageTimeout(async () => new Response(new ReadableStream({ cancel })));
    const pending = fetcher('https://example.supabase.co/auth/v1/token');
    const rejected = expect(pending).rejects.toThrow('LifeOS request timed out.');
    await vi.advanceTimersByTimeAsync(20_001);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    const controller = new AbortController();
    controller.abort(new Error('caller cancelled'));
    await expect(
      fetcher('https://example.supabase.co/auth/v1/token', { signal: controller.signal }),
    ).rejects.toThrow('caller cancelled');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('never persists a late successful sign-in with the installed SDK', async () => {
  vi.useFakeTimers();
  const writes: string[] = [];
  let respond: ((response: Response) => void) | undefined;
  const client = createLifeOsSupabaseClient(
    {
      url: 'https://late-auth.supabase.co',
      publishableKey: 'sb_publishable_synthetic',
      accountSyncEnabled: true,
    },
    {
      authStorage: new TauriSupabaseAuthStorage(async <T>(command: string) => {
        if (command !== 'sync_auth_session_read') writes.push(command);
        return null as T;
      }),
      fetch: async () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    },
  );
  const auth = new SupabaseAccountAuth(client);
  try {
    await auth.current();
    const pending = auth.signIn('person@example.com', 'existing8');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'account.request_timeout' });
    await vi.advanceTimersByTimeAsync(20_001);
    await rejected;
    respond?.(
      Response.json({
        access_token: 'late-token',
        refresh_token: 'late-refresh',
        expires_in: 3600,
        user: { id: '10000000-0000-4000-8000-000000000001' },
      }),
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual([]);
    expect(await auth.current()).toBeNull();
  } finally {
    await auth.close();
    vi.useRealTimers();
  }
});

it('bounds auth response size before parsing or storage', async () => {
  const fetcher = withStorageTimeout(async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)));
  await expect(fetcher('https://example.supabase.co/auth/v1/token')).rejects.toThrow(
    'response too large',
  );
});
