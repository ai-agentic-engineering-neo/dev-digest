import type { RunTrace } from '@devdigest/shared';

/**
 * Pure rules extracted from `run-executor.ts` (SPEC-16): prompt digest / rank
 * note text and `RunTrace` assembly. No I/O, no logger, no classes — the
 * executor does the I/O and calls these. Output strings are byte-identical to
 * the pre-extraction inline code.
 */

/** Callers digest: one `### file` heading per file, one bullet per caller. */
export function renderCallersDigest(
  rows: { file: string; symbol: string; signature: string }[],
): string | undefined {
  if (rows.length === 0) return undefined;
  const byFile = new Map<string, string[]>();
  for (const r of rows) {
    const lines = byFile.get(r.file) ?? [];
    lines.push(`- \`${r.symbol}\` — ${r.signature}`);
    byFile.set(r.file, lines);
  }
  const out: string[] = [];
  for (const [file, lines] of byFile) {
    out.push(`### ${file}`);
    out.push(...lines);
  }
  return out.join('\n');
}

/** Percentile (inclusive) at which a changed file counts as "hot". */
const HOT_PERCENTILE = 95;

/** Rank note appended to the task line; empty `note` when no file is hot. */
export function rankNote(
  ranks: { percentile: number }[],
  changedFileCount: number,
): { note: string; hotCount: number } {
  const hotCount = ranks.filter((r) => r.percentile >= HOT_PERCENTILE).length;
  if (hotCount === 0) return { note: '', hotCount: 0 };
  return {
    note: `\n\n${hotCount} of ${changedFileCount} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`,
    hotCount,
  };
}

export interface TraceAgent {
  name: string;
  version: number | string;
  provider: string;
  model: string;
}

export interface BuildTraceInput {
  agent: TraceAgent;
  prNumber: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  findingsCount: number;
  grounding: string;
  assembly: RunTrace['prompt_assembly'];
  chunks: { label: string }[];
  mode: string;
  raw: RunTrace['raw_output'];
  specsRead: RunTrace['specs_read'];
  log: RunTrace['log'];
}

/** The success-path `RunTrace` document. */
export function buildTrace(input: BuildTraceInput): RunTrace {
  const { agent, durationMs } = input;
  return {
    config: {
      agent: agent.name,
      version: String(agent.version),
      provider: agent.provider,
      model: agent.model,
      pr: input.prNumber,
      source: 'local',
    },
    stats: {
      duration_ms: durationMs,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
      cost_usd: input.costUsd,
      findings: input.findingsCount,
      grounding: input.grounding,
    },
    prompt_assembly: input.assembly,
    tool_calls: input.chunks.map((c) => ({
      tool: 'review_file',
      args: c.label,
      meta: input.mode,
      ms: Math.round(durationMs / Math.max(input.chunks.length, 1)),
    })),
    raw_output: input.raw,
    memory_pulled: [],
    specs_read: input.specsRead,
    log: input.log,
  };
}

export interface BuildFallbackTraceInput {
  agent: TraceAgent & { systemPrompt: string };
  prNumber: number;
  grounding: string;
  durationMs: number;
  log: RunTrace['log'];
}

/** Minimal trace persisted on failure/cancel; `log` is the run's SSE buffer. */
export function buildFallbackTrace(input: BuildFallbackTraceInput): RunTrace {
  const { agent } = input;
  return {
    config: {
      agent: agent.name,
      version: String(agent.version),
      provider: agent.provider,
      model: agent.model,
      pr: input.prNumber,
      source: 'local',
    },
    stats: {
      duration_ms: input.durationMs,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null,
      findings: 0,
      grounding: input.grounding,
    },
    prompt_assembly: {
      system: agent.systemPrompt,
      skills: null,
      memory: null,
      specs: null,
      intent: null,
      intent_scope: null,
      user: '',
    },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: input.log,
  };
}
