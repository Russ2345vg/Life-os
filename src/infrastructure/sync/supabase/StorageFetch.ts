/** Bound Storage requests without changing structured sync or auth transport. */
export function withStorageTimeout(fetcher: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!new URL(url).pathname.startsWith('/storage/v1/')) return fetcher(input, init);
    const controller = new AbortController();
    const original = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(original?.reason);
    if (original?.aborted) abort();
    original?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error('Storage request timed out.')),
      60_000,
    );
    try {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      if (!response.body) return response;
      // Storage uses finite JSON/blob responses. Keep the deadline through body consumption.
      const reader = response.body.getReader();
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      controller.signal.addEventListener('abort', cancel, { once: true });
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        for (;;) {
          if (controller.signal.aborted) throw new Error('Storage request aborted.');
          const next = await reader.read();
          if (controller.signal.aborted) throw new Error('Storage request aborted.');
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 96 * 1024 * 1024) throw new Error('Storage response too large.');
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
    } finally {
      clearTimeout(timer);
      original?.removeEventListener('abort', abort);
    }
  };
}
