import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { AiError, type AiGateway } from '../../application/ai/AiAssistant';

export class SupabaseAiGateway implements AiGateway {
  constructor(private readonly client: SupabaseClient) {}
  async ask(question: string, signal: AbortSignal): Promise<string> {
    const result = await this.client.functions.invoke<unknown>('lifeos-openai', {
      body: { question },
      signal,
    });
    if (result.error) {
      const error: unknown = result.error;
      const status =
        error instanceof FunctionsHttpError && error.context instanceof Response
          ? error.context.status
          : 0;
      throw new AiError(
        status === 401
          ? 'sign_in_required'
          : status === 403
            ? 'access_denied'
            : status === 402
              ? 'billing_required'
              : status === 429
                ? 'rate_limited'
                : status === 503
                  ? 'not_configured'
                  : status === 504
                    ? 'timeout'
                    : 'provider_error',
      );
    }
    const data = result.data;
    if (
      typeof data !== 'object' ||
      data === null ||
      !('answer' in data) ||
      typeof data.answer !== 'string' ||
      !data.answer.trim() ||
      data.answer.length > 12000
    )
      throw new AiError('invalid_response');
    return data.answer;
  }
}
