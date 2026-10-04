import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseAiGateway } from './SupabaseAiGateway';

function setup() {
  const client = createClient('https://example.supabase.co', 'public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: () => Promise.reject(new Error('Unexpected network call in test')) },
  });
  const functions = client.functions;
  vi.spyOn(client, 'functions', 'get').mockReturnValue(functions);
  return { invoke: vi.spyOn(functions, 'invoke'), gateway: new SupabaseAiGateway(client) };
}
describe('Supabase AI gateway', () => {
  it('uses the shared authenticated client and passes cancellation', async () => {
    const { invoke, gateway } = setup();
    invoke.mockResolvedValue({ data: { answer: 'Ответ' }, error: null });
    const signal = new AbortController().signal;
    await expect(gateway.ask('Вопрос', signal)).resolves.toBe('Ответ');
    expect(invoke).toHaveBeenCalledWith('lifeos-openai', { body: { question: 'Вопрос' }, signal });
  });
  it('sends contextual data separately from the question', async () => {
    const { invoke, gateway } = setup();
    invoke.mockResolvedValue({ data: { answer: 'Ответ' }, error: null });
    const signal = new AbortController().signal;
    const context = {
      version: 1 as const,
      section: 'goals' as const,
      date: '2026-10-03',
      period: null,
      facts: [],
      sources: [],
      omittedCount: 0,
    };
    await gateway.ask('Вопрос', signal, context);
    expect(invoke).toHaveBeenCalledWith('lifeos-openai', {
      body: { question: 'Вопрос', context },
      signal,
    });
  });
  it.each([null, { answer: '' }, { answer: 1 }, { answer: 'x'.repeat(12001) }])(
    'rejects bad output',
    async (data) => {
      const { invoke, gateway } = setup();
      invoke.mockResolvedValue({ data, error: null });
      await expect(gateway.ask('Вопрос', new AbortController().signal)).rejects.toMatchObject({
        code: 'invalid_response',
      });
    },
  );
  it('does not surface transport secrets', async () => {
    const { invoke, gateway } = setup();
    invoke.mockResolvedValue({ data: null, error: new Error('private-token') });
    await expect(gateway.ask('Вопрос', new AbortController().signal)).rejects.not.toThrow(
      'private-token',
    );
  });
  it('shows an actionable error when the API balance is exhausted', async () => {
    const { invoke, gateway } = setup();
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(Response.json({ code: 'billing_required' }, { status: 402 })),
    });
    await expect(gateway.ask('Вопрос', new AbortController().signal)).rejects.toMatchObject({
      code: 'billing_required',
    });
  });
});
