/** Keep a deadline through headers and body consumption; never return a late auth response. */
export function withSupabaseRequestTimeout(
  fetcher: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    const policy = path.startsWith('/auth/v1/')
      ? { timeout: 20_000, maxBytes: 2 * 1024 * 1024 }
      : path.startsWith('/rest/v1/')
        ? { timeout: 30_000, maxBytes: 16 * 1024 * 1024 }
        : path.startsWith('/storage/v1/')
          ? { timeout: 60_000, maxBytes: 96 * 1024 * 1024 }
          : path === '/functions/v1/lifeos-openai'
            ? { timeout: 65_000, maxBytes: 64 * 1024 }
            : null;
    if (policy === null) return fetcher(input, init);
    const controller = new AbortController();
    const original = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(original?.reason);
    if (original?.aborted) abort();
    original?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error('LifeOS request timed out.')),
      policy.timeout,
    );
    try {
      controller.signal.throwIfAborted();
      const fetching = fetcher(input, { ...init, signal: controller.signal }).then((response) => {
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          controller.signal.throwIfAborted();
        }
        return response;
      });
      const response = await untilAbort(fetching, controller.signal);
      // Chromium can expose a stream even for HTTP statuses that cannot have a body.
      // Reconstructing these responses with an empty Blob throws after a successful RPC.
      if (!response.body || [204, 205, 304].includes(response.status)) return response;
      // Keep the same deadline through finite JSON/blob response consumption.
      const reader = response.body.getReader();
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      controller.signal.addEventListener('abort', cancel, { once: true });
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await untilAbort(reader.read(), controller.signal);
          controller.signal.throwIfAborted();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > policy.maxBytes) throw new Error('LifeOS response too large.');
          chunks.push(new Uint8Array(next.value));
        }
        return new Response(new Blob(chunks), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        await reader.cancel().catch(() => undefined);
      }
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timer);
      original?.removeEventListener('abort', abort);
    }
  };
}

export const withStorageTimeout = withSupabaseRequestTimeout;

async function untilAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([pending, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
