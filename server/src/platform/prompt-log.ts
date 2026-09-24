/**
 * Safe, content-free structured logging of what went into every prompt sent
 * to a model (docs/plans/2026-09-24-prompt-assembly-logging.md). ONE pino
 * `prompt_assembled` line per LLM call: feature, correlation id,
 * provider/model, and per-section name/source/trust/chars/estimated tokens —
 * NEVER the section's actual text. `verbose` adds ONLY identifiers (a chunk's
 * file path, an intent source's kind/ref/status) and is gated by
 * `config.promptLogVerbose` (dev + loopback only, see platform/config.ts).
 *
 * Sink = the app's pino logger (`info` level), injected via the Container —
 * NOT RunBus: this is an operator/debug signal, never user-visible or
 * persisted (server/README.md#review-context-non-obvious).
 */
import { estimateTokens, PROMPT_SECTION_NAMES, type PromptSectionName, type PromptSectionSource } from '@devdigest/reviewer-core';

/**
 * Section names logged by callers that build their own messages instead of
 * going through reviewer-core's `assemblePrompt` (intent, conventions) — the
 * server-only additions to `PROMPT_SECTION_NAMES` below.
 */
const SERVER_ONLY_SECTION_NAMES = ['intent_sources', 'repository_sample'] as const;

export type PromptLogSectionName = PromptSectionName | (typeof SERVER_ONLY_SECTION_NAMES)[number];

export interface PromptLogSectionMeta {
  name: PromptLogSectionName;
  source: PromptSectionSource;
  role: 'system' | 'user';
  trust: 'trusted' | 'untrusted';
  chars: number;
  tokens: number;
  items?: number;
  truncated?: boolean;
}

/**
 * Runtime allowlist backstop, derived from reviewer-core's own `as const`
 * section-name list plus the server-only names above — never duplicated by
 * hand, so a core section added without a matching server edit is still
 * allowlisted (logged), never silently dropped (docs/plans/2026-09-24-
 * prompt-assembly-logging.md, Fix round r2 F4).
 */
const KNOWN_SECTION_NAMES: ReadonlySet<PromptLogSectionName> = new Set<PromptLogSectionName>([
  ...PROMPT_SECTION_NAMES,
  ...SERVER_ONLY_SECTION_NAMES,
]);

const KNOWN_SECTION_SOURCES: ReadonlySet<PromptSectionSource> = new Set<PromptSectionSource>([
  'engine',
  'agent_config',
  'author',
  'model_derived',
  'repo',
  'curated',
]);

export interface PromptLogChunk {
  index: number;
  total: number;
}

/** Identifiers only — never prompt CONTENT. Included only when verbose is on. */
export interface PromptLogVerbose {
  /** File path of the reviewed chunk (review feature only). */
  chunkLabel?: string;
  /** Intent sources used, by kind/ref/status — never their fetched text. */
  sources?: { kind: string; ref: string; status: string }[];
}

export interface PromptLogEntry {
  feature: 'review' | 'intent' | 'conventions';
  /** review = runId; intent = `intent:<prId>:<hash[0..12]>`; conventions = scanId. */
  correlationId: string;
  provider: string;
  model: string;
  sections: PromptLogSectionMeta[];
  /** Map-reduce chunk position (review feature only). */
  chunk?: PromptLogChunk;
  verbose?: PromptLogVerbose;
}

export interface PromptLogPort {
  assembled(entry: PromptLogEntry): void;
}

/**
 * Build the `{ name, source, trust, chars, tokens }` record for a section a
 * caller assembled itself (intent/conventions don't go through
 * `assemblePrompt`). `text` is measured for length/tokens only — it is never
 * copied into the returned record.
 */
export function sectionMeta(
  name: PromptLogSectionName,
  source: PromptSectionSource,
  trust: 'trusted' | 'untrusted',
  text: string,
  extra?: { items?: number; truncated?: boolean },
): PromptLogSectionMeta {
  return {
    name,
    source,
    role: name === 'system' ? 'system' : 'user',
    trust,
    chars: text.length,
    tokens: estimateTokens(text),
    ...(extra?.items !== undefined ? { items: extra.items } : {}),
    ...(extra?.truncated !== undefined ? { truncated: extra.truncated } : {}),
  };
}

/**
 * Pure builder: entry → the exact object handed to pino. Every field is
 * copied explicitly (never a spread of the input), so a stray content-bearing
 * key on `entry` can never reach the sink. Unknown section names/sources are
 * dropped — a runtime backstop on top of the closed TS unions (a stale caller
 * bypassing the type system, e.g. via `as any`, still can't smuggle a section
 * logging code doesn't recognize).
 */
export function buildPromptLogRecord(entry: PromptLogEntry, opts: { verbose: boolean }): Record<string, unknown> {
  const sections = entry.sections
    .filter((s) => KNOWN_SECTION_NAMES.has(s.name) && KNOWN_SECTION_SOURCES.has(s.source))
    .map((s) => {
      const out: Record<string, unknown> = {
        name: s.name,
        source: s.source,
        role: s.role,
        trust: s.trust,
        chars: s.chars,
        tokens: s.tokens,
      };
      if (s.items !== undefined) out.items = s.items;
      if (s.truncated !== undefined) out.truncated = s.truncated;
      return out;
    });
  const totalChars = sections.reduce((n, s) => n + (s.chars as number), 0);
  const totalTokens = sections.reduce((n, s) => n + (s.tokens as number), 0);

  const record: Record<string, unknown> = {
    evt: 'prompt_assembled',
    feature: entry.feature,
    correlationId: entry.correlationId,
    provider: entry.provider,
    model: entry.model,
    sections,
    totalChars,
    totalTokens,
  };
  if (entry.chunk) record.chunk = { index: entry.chunk.index, total: entry.chunk.total };
  if (opts.verbose && entry.verbose) {
    const verbose: Record<string, unknown> = {};
    if (entry.verbose.chunkLabel !== undefined) verbose.chunkLabel = entry.verbose.chunkLabel;
    if (entry.verbose.sources !== undefined) {
      verbose.sources = entry.verbose.sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status }));
    }
    record.verbose = verbose;
  }
  return record;
}

/** Minimal logger port — the shape a pino/Fastify `app.log`, or a `{info}`-only test double, satisfies. */
export interface PromptLogSink {
  info(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Container-owned sink (see platform/container.ts). Never throws — a logging
 * failure must not break the review/intent/scan it observes (mirrors
 * reviewer-core's `emitUsage`). No-op when the app has no logger wired (a
 * bare `new Container(config, db)` in unit tests) or the logger doesn't
 * expose `info` (e.g. the GitHub client's `{warn}`-only logger shape).
 */
export class PromptLog implements PromptLogPort {
  constructor(
    private readonly verbose: boolean,
    private readonly sink?: Partial<PromptLogSink>,
  ) {}

  assembled(entry: PromptLogEntry): void {
    if (!this.sink?.info) return;
    try {
      this.sink.info(buildPromptLogRecord(entry, { verbose: this.verbose }), 'prompt_assembled');
    } catch {
      // observational — must never break the caller (mirrors reviewer-core's emitUsage)
    }
  }
}
