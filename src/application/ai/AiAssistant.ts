export interface AiGateway {
  ask(question: string, signal: AbortSignal): Promise<string>;
}
export interface AiAssistant {
  readonly available: boolean;
  ask(question: string, signal?: AbortSignal): Promise<string>;
}
const messages = {
  not_configured: 'Подключение OpenAI ещё не настроено для этой сборки.',
  invalid_question: 'Введите вопрос длиной до 4000 символов.',
  sign_in_required: 'Войдите в LifeOS с подтверждённым аккаунтом.',
  access_denied: 'Для этого аккаунта доступ к OpenAI не включён.',
  rate_limited: 'Лимит OpenAI исчерпан. Попробуйте позже.',
  billing_required: 'Закончились кредиты OpenAI API. Пополните баланс в OpenAI Platform.',
  timeout: 'Ответ не получен вовремя. Попробуйте ещё раз.',
  cancelled: 'Запрос отменён.',
  invalid_response: 'Не удалось получить полный ответ. Попробуйте ещё раз.',
  provider_error: 'OpenAI сейчас недоступен. Попробуйте позже.',
} as const;
export type AiErrorCode = keyof typeof messages;
export class AiError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(messages[code]);
  }
}

interface AiAccountReader {
  current(): Promise<{ readonly isAnonymous: boolean; readonly emailVerified: boolean } | null>;
}

export class AiAssistantService implements AiAssistant {
  readonly available: boolean;
  constructor(
    private readonly gateway: AiGateway | null = null,
    private readonly account: AiAccountReader | null = null,
  ) {
    this.available = gateway !== null && account !== null;
  }

  async ask(question: string, signal?: AbortSignal): Promise<string> {
    if (!this.gateway || !this.account) throw new AiError('not_configured');
    if (!question.trim() || question.length > 4000) throw new AiError('invalid_question');
    const controller = new AbortController();
    const abort = () => controller.abort(new AiError('cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new AiError('timeout')), 70_000);
    let rejectOnAbort = () => undefined as void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
    });
    try {
      controller.signal.throwIfAborted();
      const work = async () => {
        const identity = await this.account!.current();
        controller.signal.throwIfAborted();
        if (!identity || identity.isAnonymous || !identity.emailVerified)
          throw new AiError('sign_in_required');
        const answer = await this.gateway!.ask(question.trim(), controller.signal);
        controller.signal.throwIfAborted();
        return answer;
      };
      return await Promise.race([work(), aborted]);
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError('provider_error');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', rejectOnAbort);
      controller.abort();
    }
  }
}
