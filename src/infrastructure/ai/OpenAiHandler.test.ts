import { describe, expect, it, vi } from 'vitest';
import { createOpenAiHandler } from '../../../supabase/functions/lifeos-openai/handler';

const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'public-test-key',
  apiKey: 'server-secret',
  model: 'test-model',
  allowedUserIds: ['owner'],
};
const user = { id: 'owner', is_anonymous: false, email_confirmed_at: '2026-01-01' };
const request = (body: unknown = { question: 'Привет' }, authenticated = true) =>
  new Request('https://example.supabase.co/functions/v1/lifeos-openai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { authorization: 'Bearer user-token' } : {}),
    },
    body: JSON.stringify(body),
  });
const completed = {
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'Здравствуйте' }] }],
};

describe('OpenAI server boundary', () => {
  it('sends only the explicit question, server model and instructions without storing a response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(user))
      .mockResolvedValueOnce(Response.json(completed));
    const response = await createOpenAiHandler(config, fetcher)(request());
    expect(await response.json()).toEqual({ answer: 'Здравствуйте' });
    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer server-secret');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'test-model',
      input: 'Привет',
      store: false,
      max_output_tokens: 1200,
      instructions: expect.any(String),
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('fails closed without server configuration', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await createOpenAiHandler({ ...config, apiKey: '' }, fetcher)(request());
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests before any upstream call', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await createOpenAiHandler(config, fetcher)(request({}, false))).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { ...user, id: 'someone-else' },
    { ...user, is_anonymous: true },
    { ...user, email_confirmed_at: null },
  ])('rejects unauthorized users before OpenAI: %j', async (identity) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(identity));
    expect((await createOpenAiHandler(config, fetcher)(request())).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { question: '' },
    { question: 'x'.repeat(4001) },
    { question: 'Hi', model: 'override' },
    null,
  ])('rejects invalid payload %j', async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(user));
    expect((await createOpenAiHandler(config, fetcher)(request(body))).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a body larger than the byte limit even without content-length', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(user));
    const response = await createOpenAiHandler(
      config,
      fetcher,
    )(request({ question: 'x'.repeat(33000) }));
    expect(response.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 429, 500])('does not expose provider errors or retry (%s)', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(user))
      .mockResolvedValueOnce(Response.json({ error: 'server-secret private-prompt' }, { status }));
    const response = await createOpenAiHandler(config, fetcher)(request());
    expect(response.status).toBe(status === 429 ? 429 : 502);
    expect(await response.text()).not.toMatch(/server-secret|private-prompt/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('distinguishes exhausted API credits from a temporary rate limit', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(user))
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'credit_balance_exhausted', message: 'private provider details' } },
          { status: 429 },
        ),
      );
    const response = await createOpenAiHandler(config, fetcher)(request());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ code: 'billing_required' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    { status: 'incomplete', output: completed.output },
    { status: 'completed', output: [] },
    {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }],
    },
    {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'x'.repeat(12001) }] }],
    },
  ])('rejects incomplete, refused or malformed output', async (body) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(user))
      .mockResolvedValueOnce(Response.json(body));
    expect((await createOpenAiHandler(config, fetcher)(request())).status).toBe(502);
  });

  it('bounds an upstream request that never resolves', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
      const pending = createOpenAiHandler(config, fetcher)(request());
      await vi.advanceTimersByTimeAsync(60001);
      expect((await pending).status).toBe(504);
    } finally {
      vi.useRealTimers();
    }
  });
});
