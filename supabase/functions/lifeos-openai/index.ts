import { createOpenAiHandler } from './handler.ts';

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

// Read secrets only in the Edge runtime. Nothing in this directory is a frontend import.
Deno.serve(
  createOpenAiHandler({
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    supabaseKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
    model: Deno.env.get('LIFEOS_OPENAI_MODEL') ?? '',
    allowedUserIds: (Deno.env.get('LIFEOS_OPENAI_ALLOWED_USER_IDS') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  }),
);
