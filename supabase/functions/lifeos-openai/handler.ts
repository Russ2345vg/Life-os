export interface OpenAiServerConfig {
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
  readonly apiKey: string;
  readonly model: string;
  readonly allowedUserIds: readonly string[];
}

const headers = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
class RequestFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** No database reads, prompt logging, client-selected models, tools or automatic retries. */
export function createOpenAiHandler(config: OpenAiServerConfig, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { code: 'method_not_allowed' });
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    const timer = setTimeout(abort, 60_000);
    try {
      if (
        !config.apiKey.trim() ||
        !config.model.trim() ||
        !config.supabaseUrl ||
        !config.supabaseKey ||
        config.allowedUserIds.length === 0
      )
        throw new RequestFailure(503, 'not_configured');
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer \S+$/i.test(authorization))
        throw new RequestFailure(401, 'sign_in_required');
      const identityResponse = await bounded(
        fetcher(`${config.supabaseUrl}/auth/v1/user`, {
          headers: { authorization, apikey: config.supabaseKey },
          signal: controller.signal,
          redirect: 'error',
        }),
        controller.signal,
      );
      if (!identityResponse.ok) {
        void identityResponse.body?.cancel();
        throw new RequestFailure(401, 'sign_in_required');
      }
      const identity = await limitedJson(identityResponse.body, 64_000, controller.signal);
      if (
        !record(identity) ||
        typeof identity.id !== 'string' ||
        !config.allowedUserIds.includes(identity.id) ||
        identity.is_anonymous !== false ||
        typeof identity.email_confirmed_at !== 'string' ||
        !identity.email_confirmed_at
      )
        throw new RequestFailure(403, 'access_denied');
      let input: unknown;
      try {
        input = await limitedJson(request.body, 32_000, controller.signal);
      } catch {
        throw new RequestFailure(400, 'invalid_question');
      }
      if (
        !record(input) ||
        Object.keys(input).some((key) => key !== 'question') ||
        typeof input.question !== 'string' ||
        !input.question.trim() ||
        input.question.length > 4000
      )
        throw new RequestFailure(400, 'invalid_question');
      const upstream = await bounded(
        fetcher('https://api.openai.com/v1/responses', {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: config.model,
            input: input.question.trim(),
            store: false,
            max_output_tokens: 1200,
            instructions:
              'Ты помощник LifeOS. Отвечай кратко и по-русски. У тебя нет доступа к задачам, дневнику или другим данным LifeOS. Не утверждай, что прочитал или изменил их.',
          }),
        }),
        controller.signal,
      );
      if (!upstream.ok) {
        if (upstream.status === 429) {
          let creditsExhausted = false;
          try {
            const failure = await limitedJson(upstream.body, 64_000, controller.signal);
            creditsExhausted =
              record(failure) &&
              record(failure.error) &&
              failure.error.code === 'credit_balance_exhausted';
          } catch {
            // An unreadable provider error remains a generic rate limit.
          }
          throw new RequestFailure(
            creditsExhausted ? 402 : 429,
            creditsExhausted ? 'billing_required' : 'rate_limited',
          );
        }
        void upstream.body?.cancel();
        throw new RequestFailure(502, 'provider_error');
      }
      const output = await limitedJson(upstream.body, 256_000, controller.signal);
      return reply(200, { answer: answerText(output) });
    } catch (error) {
      if (controller.signal.aborted) return reply(504, { code: 'timeout' });
      if (error instanceof RequestFailure) return reply(error.status, { code: error.code });
      return reply(502, { code: 'provider_error' });
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
      controller.abort();
    }
  };
}

function answerText(output: unknown): string {
  if (!record(output) || output.status !== 'completed' || !Array.isArray(output.output))
    throw new RequestFailure(502, 'invalid_response');
  const texts: string[] = [];
  for (const item of output.output) {
    if (!record(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (record(part) && part.type === 'refusal') throw new RequestFailure(502, 'refused');
      if (record(part) && part.type === 'output_text' && typeof part.text === 'string')
        texts.push(part.text);
    }
  }
  const answer = texts.join('\n').trim();
  if (!answer || answer.length > 12_000) throw new RequestFailure(502, 'invalid_response');
  return answer;
}

async function limitedJson(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  if (!body) throw new Error('Missing body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    for (;;) {
      const next = await bounded(reader.read(), signal);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) throw new Error('Body too large');
      text += decoder.decode(next.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

async function bounded<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort = () => undefined as void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error('Request cancelled'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([pending, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
