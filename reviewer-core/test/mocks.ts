import { z } from 'zod';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
  UnifiedDiff,
} from '@devdigest/shared';

/**
 * Local test doubles for reviewer-core's own suite. Deliberately NOT imported
 * from the server: reviewer-core has no dependents other than server, and its
 * own tests shouldn't depend back on the server's internal file layout (see
 * repo-root CLAUDE.md — "cross-package code goes through tsconfig path
 * aliases, never npm/pnpm workspaces").
 */

export interface MockLLMOptions {
  /** Fixture returned by completeStructured (validated against the caller's schema). */
  structured?: unknown;
}

/**
 * Minimal deterministic `LLMProvider` double — no network. `completeStructured`
 * validates the fixture against the request's Zod schema exactly like the real
 * providers would, so mis-shaped fixtures fail loudly instead of silently.
 */
export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  public calls: { method: string; req: unknown }[] = [];

  constructor(
    id: 'openai' | 'anthropic' | 'openrouter' = 'openai',
    private opts: MockLLMOptions = {},
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.push({ method: 'listModels', req: null });
    return [{ id: 'gpt-4.1', provider: this.id === 'anthropic' ? 'anthropic' : 'openai' }];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return { text: 'mock completion', model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001 };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const fixture = this.opts.structured ?? {};
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`MockLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push({ method: 'embed', req: texts });
    return texts.map(() => new Array(1536).fill(0));
  }
}

/**
 * Fixed unified diff: one file, one hunk, new-side lines 10–12 touched (a
 * Stripe secret added at line 11). Mirrors the server's `MockGitClient`
 * default diff so the fixtures that were pinned against it (line 11 grounded,
 * line 999 hallucinated) keep working unchanged.
 */
export function mockDiff(): UnifiedDiff {
  return {
    raw: [
      'diff --git a/src/config.ts b/src/config.ts',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      '@@ -10,3 +10,4 @@',
      '   port: 3000,',
      '+  stripeKey: "sk_live_xxx",',
      '   redisUrl: x,',
    ].join('\n'),
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
}
