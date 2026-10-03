import { describe, expect, it, vi } from 'vitest';
import { AiAssistantService } from './AiAssistant';

const auth = { current: vi.fn().mockResolvedValue({ isAnonymous: false, emailVerified: true }) };
describe('AI assistant', () => {
  it('sends only a validated explicit question', async () => {
    const ask = vi.fn().mockResolvedValue('Ответ');
    const service = new AiAssistantService({ ask }, auth);
    await expect(service.ask('  Вопрос  ')).resolves.toBe('Ответ');
    expect(ask).toHaveBeenCalledWith('Вопрос', expect.any(AbortSignal));
  });
  it.each(['', ' ', 'x'.repeat(4001)])('rejects invalid input', async (question) => {
    const ask = vi.fn();
    await expect(new AiAssistantService({ ask }, auth).ask(question)).rejects.toMatchObject({
      code: 'invalid_question',
    });
    expect(ask).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { isAnonymous: true, emailVerified: true },
    { isAnonymous: false, emailVerified: false },
  ])('requires a verified non-anonymous account', async (session) => {
    const ask = vi.fn();
    await expect(
      new AiAssistantService({ ask }, { current: vi.fn().mockResolvedValue(session) }).ask(
        'Вопрос',
      ),
    ).rejects.toMatchObject({ code: 'sign_in_required' });
    expect(ask).not.toHaveBeenCalled();
  });
  it('is unavailable by default', async () => {
    const service = new AiAssistantService();
    expect(service.available).toBe(false);
    await expect(service.ask('Вопрос')).rejects.toMatchObject({ code: 'not_configured' });
  });
  it('cancels pending auth before a provider request', async () => {
    const controller = new AbortController();
    const ask = vi.fn();
    const service = new AiAssistantService(
      { ask },
      { current: () => new Promise(() => undefined) },
    );
    const pending = service.ask('Вопрос', controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    controller.abort();
    await assertion;
    expect(ask).not.toHaveBeenCalled();
  });
  it('bounds the whole request and sanitizes unexpected errors', async () => {
    const service = new AiAssistantService(
      { ask: vi.fn().mockRejectedValue(new Error('secret')) },
      auth,
    );
    await expect(service.ask('Вопрос')).rejects.not.toThrow('secret');
    vi.useFakeTimers();
    try {
      const pending = new AiAssistantService({ ask: () => new Promise(() => undefined) }, auth).ask(
        'Вопрос',
      );
      const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(70_001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
