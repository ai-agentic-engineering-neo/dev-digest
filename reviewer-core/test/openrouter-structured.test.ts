import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter';

function providerReplying(content: string) {
  const provider = new OpenRouterProvider('key', { maxRetries: 0 });
  (provider as unknown as { client: unknown }).client = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      },
    },
  };
  return provider;
}

describe('OpenRouterProvider.completeStructured failure message', () => {
  it('names the schema and the issues, never the raw output', async () => {
    // The sentinel sits in the failing enum field: Zod's own message would echo it.
    const provider = providerReplying(JSON.stringify({ kind: 'sk-live-123', title: 1 }));
    const schema = z.object({ kind: z.enum(['auth', 'other']), title: z.string() });
    const err = await provider
      .completeStructured({ model: 'm', schema, schemaName: 'Brief', messages: [], maxRetries: 0 })
      .catch((e: Error) => e);
    expect((err as Error).message).toMatch(/failed schema validation for Brief/);
    expect((err as Error).message).toContain('kind: invalid_enum_value');
    expect((err as Error).message).toContain('title: Expected string, received number');
    expect((err as Error).message).not.toContain('sk-live-123');
  });

  it('keeps a malformed reply out of the message (JSON.parse quotes its input)', async () => {
    const provider = providerReplying('{"kind": sk-live-123-not-json');
    const schema = z.object({ kind: z.enum(['auth', 'other']) });
    const err = await provider
      .completeStructured({ model: 'm', schema, schemaName: 'Brief', messages: [], maxRetries: 0 })
      .catch((e: Error) => e);
    expect((err as Error).message).toMatch(/failed schema validation for Brief: Output was not valid JSON$/);
    expect((err as Error).message).not.toContain('sk-live-123');
  });
});
