/**
 * Test doubles local to reviewer-core. This package imports nothing from
 * server/ except the shared contracts, and that holds for its tests too.
 */
import type { z } from 'zod';
import type {
  LLMProvider,
  StructuredRequest,
  StructuredResult,
  UnifiedDiff,
} from '@devdigest/shared';

/** An LLM that answers every structured request with one fixture. */
export function stubLLM(structured: unknown): LLMProvider {
  return {
    id: 'openai',
    async listModels() {
      return [];
    },
    async complete(req) {
      return { text: 'stub completion', model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001 };
    },
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      // Parse through the request's schema, as a real provider adapter does.
      const parsed = (req.schema as z.ZodType<T>).safeParse(structured);
      if (!parsed.success) throw new Error(`stub fixture failed schema: ${parsed.error.message}`);
      return {
        data: parsed.data,
        model: req.model,
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.001,
        raw: JSON.stringify(structured),
        attempts: 1,
      };
    },
  } as LLMProvider;
}

/** One file, one hunk: line 11 of src/config.ts is added (lines 10–12 are in the diff). */
export const CONFIG_DIFF: UnifiedDiff = {
  raw:
    'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n' +
    '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  files: [
    {
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        {
          file: 'src/config.ts',
          oldStart: 10,
          oldLines: 3,
          newStart: 10,
          newLines: 4,
          newLineNumbers: [10, 11, 12],
        },
      ],
    },
  ],
};
