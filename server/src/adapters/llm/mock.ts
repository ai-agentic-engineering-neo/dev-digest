import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Review,
} from '@devdigest/shared';
import { emitUsage } from '@devdigest/reviewer-core';
import { ExternalServiceError } from '../../platform/errors.js';

/**
 * DEV/E2E ONLY — the deterministic LLM behind `LLM_PROVIDER_OVERRIDE=mock`.
 *
 * Every provider id resolves to this class (Container.llm), so the whole review
 * flow — run → SSE live log → persisted review + findings → accept/dismiss — can
 * be driven in a browser with no API key, no network and no spend.
 *
 * - `completeStructured` for the `Review` schema returns MOCK_REVIEW: two
 *   findings placed on the seeded PR #482 diff (db/seed-diff.ts), so they
 *   survive the grounding gate there. On any other diff they are dropped by
 *   grounding (the run still ends `done`, with 0 findings). When the prompt
 *   carries skills, the first finding cites the first one (`Finding.skill`).
 * - Other structured schemas have no fixture → ExternalServiceError (the
 *   feature under test fails loudly instead of receiving invented data).
 * - `delayMs` makes each call take that long (abortable by the run's signal),
 *   so the UI's "running" state is observable.
 *
 * Distinct from adapters/mocks.ts MockLLMProvider, which is the configurable
 * unit-test double; this one is a fixed runtime behaviour.
 */

/** Fixed usage reported per call (priced so cost shows up in the UI). */
export const MOCK_USAGE = { tokensIn: 1_200, tokensOut: 180, costUsd: 0.00042 } as const;

export const MOCK_REVIEW: Review = {
  verdict: 'comment',
  summary:
    '[mock LLM] The token-bucket limiter works, but its key trusts a client-controlled header and the bucket map never shrinks.',
  score: 70,
  findings: [
    {
      id: 'mock-1',
      severity: 'WARNING',
      category: 'security',
      title: 'Rate-limit key trusts the spoofable X-Forwarded-For header',
      file: 'src/middleware/ratelimit.ts',
      start_line: 7,
      end_line: 7,
      rationale:
        'Any client can send a fresh `X-Forwarded-For` value on every request and get a new bucket, which bypasses the limiter.',
      suggestion: "Key on `req.ip` with Fastify's `trustProxy` configured for your load balancer.",
      confidence: 0.9,
      kind: 'finding',
    },
    {
      id: 'mock-2',
      severity: 'SUGGESTION',
      category: 'perf',
      title: 'Bucket map grows without eviction',
      file: 'src/middleware/ratelimit.ts',
      start_line: 4,
      end_line: 4,
      rationale: 'One entry is kept per distinct key forever, so memory grows with the number of clients.',
      suggestion: 'Use an LRU / TTL map, or evict buckets that have refilled completely.',
      confidence: 0.72,
      kind: 'finding',
    },
  ],
};

/**
 * The first skill name in the prompt's `## Skills / rules` section (its first
 * `### <name>` heading), or null when the prompt carries no skills.
 */
export function firstPromptSkill(messages: readonly { content: string }[]): string | null {
  for (const m of messages) {
    const start = m.content.indexOf('## Skills / rules\n');
    if (start < 0) continue;
    const section = m.content.slice(start).split(/\n## (?!#)/)[0]!;
    const heading = /^### (\S+)/m.exec(section);
    if (heading) return heading[1]!;
  }
  return null;
}

/**
 * MOCK_REVIEW, with its first finding citing the prompt's first skill (so the
 * skill attribution + stats flow is visible end-to-end); no skills → no citation.
 */
function mockReviewFor(messages: readonly { content: string }[]): Review {
  const skill = firstPromptSkill(messages);
  if (!skill) return MOCK_REVIEW;
  const [first, ...rest] = MOCK_REVIEW.findings;
  return { ...MOCK_REVIEW, findings: [{ ...first!, skill }, ...rest] };
}

export interface MockReviewLLMOptions {
  /** Latency of each call in ms (default 0). Aborted by the request signal. */
  delayMs?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class MockReviewLLMProvider implements LLMProvider {
  constructor(
    readonly id: 'openai' | 'anthropic' | 'openrouter',
    private readonly opts: MockReviewLLMOptions = {},
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'mock/reviewer', provider: this.id, label: 'Mock reviewer (LLM_PROVIDER_OVERRIDE=mock)' }];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    await sleep(this.opts.delayMs ?? 0, req.signal);
    return { text: '[mock LLM completion]', model: req.model, ...MOCK_USAGE };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await sleep(this.opts.delayMs ?? 0, req.signal);
    if (req.schemaName !== 'Review') {
      throw new ExternalServiceError(`Mock LLM provider has no fixture for structured output '${req.schemaName}'`);
    }
    emitUsage(req.onUsage, { ...MOCK_USAGE });
    const review = mockReviewFor(req.messages);
    const data = req.schema.parse(review);
    return { data, model: req.model, ...MOCK_USAGE, raw: JSON.stringify(review), attempts: 1 };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(1536).fill(0));
  }
}
