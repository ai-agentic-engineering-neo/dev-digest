import type { PromptSectionMeta } from '@devdigest/reviewer-core';

/**
 * Structured log record for prompt assembly.
 *
 * Built by ALLOWLIST: it copies only ids, fixed labels and numbers from the
 * engine's section manifest. It never receives prompt text (diff, specs, skill
 * bodies, PR body, system prompt), so nothing private or secret can reach a log
 * line through it — there is no field a secret could be routed into.
 */
export interface PromptLogContext {
  /** Correlation id: the agent run id — the same key as run_traces and the Live Log. */
  runId: string;
  prId: string;
  agent: string;
  provider: string;
  model: string;
  mode: string;
}

const MAX_AGENT_CHARS = 80;

export function buildPromptLog(
  manifest: PromptSectionMeta[],
  ctx: PromptLogContext,
  verbose: boolean,
): Record<string, unknown> {
  const sections = manifest.map((s) => ({
    name: s.name,
    origin: s.origin,
    chars: s.chars,
    approx_tokens: s.approx_tokens,
    truncated: s.truncated,
    ...(s.items !== undefined ? { items: s.items } : {}),
    ...(verbose
      ? {
          lines: s.lines,
          raw_chars: s.raw_chars,
          ...(s.item_chars ? { item_chars: s.item_chars } : {}),
        }
      : {}),
  }));
  const totalChars = manifest.reduce((n, s) => n + s.chars, 0);
  return {
    event: 'prompt.assembled',
    correlation_id: ctx.runId,
    run_id: ctx.runId,
    pr_id: ctx.prId,
    agent: ctx.agent.slice(0, MAX_AGENT_CHARS),
    provider: ctx.provider,
    model: ctx.model,
    mode: ctx.mode,
    total_chars: totalChars,
    approx_tokens: Math.ceil(totalChars / 4),
    section_count: manifest.length,
    ...(verbose ? { token_estimate: 'ceil(chars / 4), not a tokenizer count' } : {}),
    sections,
  };
}
