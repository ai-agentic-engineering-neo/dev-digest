import type { PromptSectionMeta } from '@devdigest/reviewer-core';
import type { PromptLogMode } from './config.js';

/**
 * Structured log of what went into a model prompt: one `prompt.assembled` line
 * per prompt sent, carrying section names, sources and sizes — never section
 * text, the diff, PR text, linked docs or keys.
 *
 * `summary` (default) is safe for any log sink. `verbose` adds per-item sizes,
 * item labels (skill names, file and doc paths, issue numbers) and content
 * fingerprints; it is honoured only with NODE_ENV=development (see config.ts)
 * because a fingerprint of a short text can confirm a guess at that text.
 */

export type PromptLogSink = { info: (obj: unknown, msg?: string) => void };

export interface PromptLog {
  readonly mode: PromptLogMode;
  readonly sink?: PromptLogSink;
}

export type PromptLogSection = Omit<PromptSectionMeta, 'name'> & {
  name: string;
  /** Verbose only. */
  details?: { label: string; chars: number }[];
};

export interface PromptLogContext {
  purpose: 'review' | 'intent';
  /** Shared by every prompt of one review click (intent + each agent), or the request id of a Derive. */
  correlationId: string;
  prId: string;
  runId?: string;
  agent?: string;
  provider: string;
  model: string;
  strategy?: string;
  chunk?: { index: number; count: number; label: string };
}

export function approxTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export function logPromptAssembly(
  log: PromptLog,
  ctx: PromptLogContext,
  sections: PromptLogSection[],
): void {
  if (log.mode === 'off' || !log.sink) return;
  const verbose = log.mode === 'verbose';
  const totalChars = sections.reduce((n, s) => n + s.chars, 0);
  const { chunk, ...rest } = ctx;

  log.sink.info(
    {
      event: 'prompt.assembled',
      ...rest,
      ...(chunk
        ? { chunk: `${chunk.index + 1}/${chunk.count}`, ...(verbose ? { chunkLabel: chunk.label } : {}) }
        : {}),
      sections: sections.map((s) => ({
        name: s.name,
        source: s.source,
        wrapped: s.wrapped,
        chars: s.chars,
        approxTokens: approxTokens(s.chars),
        ...(verbose
          ? {
              fingerprint: s.fingerprint,
              ...(s.items ? { items: s.items } : {}),
              ...(s.details ? { details: s.details } : {}),
            }
          : {}),
      })),
      totalChars,
      approxTokens: approxTokens(totalChars),
      logMode: log.mode,
    },
    `prompt: ${ctx.purpose} assembled — ${sections.length} section(s), ${totalChars} chars ≈ ${approxTokens(totalChars)} tok (${ctx.provider}/${ctx.model})`,
  );
}
