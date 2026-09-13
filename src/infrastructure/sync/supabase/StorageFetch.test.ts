import { expect, it, vi } from 'vitest';
import { createLifeOsSupabaseClient } from './createLifeOsSupabaseClient';
import { withStorageTimeout } from './StorageFetch';

it('keeps the deadline until a stalled response body is cancelled', async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    const fetcher = withStorageTimeout(async () => new Response(new ReadableStream({ cancel })));
    const pending = fetcher('https://example.supabase.co/storage/v1/object/file');
    const rejected = expect(pending).rejects.toThrow('aborted');
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
      { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' },
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
