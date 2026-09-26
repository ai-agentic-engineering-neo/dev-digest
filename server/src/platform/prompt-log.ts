import { createHash } from 'node:crypto';
import { Provider } from '@devdigest/shared';
import type { PromptMeasure } from '@devdigest/reviewer-core';

/**
 * Content-free logging of prompt assembly (`event: "prompt.assembled"`).
 *
 * One record per prompt sent to a model. It lists each section's name, trust
 * source and size, the provider/model and the correlation ids — never a secret,
 * a diff line, a spec or skill body, or any other prompt text.
 *
 * Content-free BY CONSTRUCTION: `buildPromptLogRecord` builds a new object field
 * by field (no spread of any input), and no field can hold free text — only
 * closed enums, validated ids, numbers and (verbose only) 8-hex fingerprints.
 *
 * Cross-cutting platform helper: imports no fastify, drizzle, container or
 * module, so `reviews` and `intent` can both use it (`no-cross-module-imports`).
 */

export type PromptLogMode = 'off' | 'summary' | 'verbose';

/** Structural tokenizer shape; the container's `Tokenizer` satisfies it. */
export interface PromptLogTokenizer {
  count(text: string): number;
}

/**
 * Effective mode for a requested one. `verbose` is honoured only in
 * development (it adds fingerprints, which are for a developer's own machine);
 * anywhere else it is downgraded to `summary` and the caller warns once.
 */
export function resolvePromptLogMode(
  requested: PromptLogMode,
  nodeEnv: 'development' | 'test' | 'production',
): { mode: PromptLogMode; downgraded: boolean } {
  if (requested === 'verbose' && nodeEnv !== 'development') {
    return { mode: 'summary', downgraded: true };
  }
  return { mode: requested, downgraded: false };
}

/**
 * The measurement functions handed to the engine. `off` returns `undefined`, so
 * no tokenizer call happens at all; `verbose` adds an 8-hex sha256 fingerprint.
 */
export function createPromptMeasure(
  mode: PromptLogMode,
  tokenizer: PromptLogTokenizer,
): PromptMeasure | undefined {
  if (mode === 'off') return undefined;
  const tokens = (text: string) => tokenizer.count(text);
  if (mode === 'summary') return { tokens };
  return {
    tokens,
    fingerprint: (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 8),
  };
}

// ----------------------------------------------------------------- the record

/** Closed vocabularies. An unknown name becomes `other`, so a future section name (or an intent label) can never carry text into a log. */
const REVIEWER_SECTIONS = [
  'system',
  'task',
  'pr_description',
  'pr_intent',
  'skills',
  'memory',
  'repo_map',
  'specs',
  'callers',
  'diff',
] as const;
const INTENT_SECTIONS = [
  'system',
  'task',
  'pr_title',
  'description',
  'issue',
  'repo_doc',
  'web',
  'diff_outline',
] as const;
export const PROMPT_SECTION_LOG_NAMES = {
  reviewer: REVIEWER_SECTIONS,
  intent_classifier: INTENT_SECTIONS,
} as const;

export type PromptLogComponent = keyof typeof PROMPT_SECTION_LOG_NAMES;
export type PromptSectionLogName =
  | (typeof REVIEWER_SECTIONS)[number]
  | (typeof INTENT_SECTIONS)[number]
  | 'other';

/** What a caller may hand in for one section. Loose on purpose: the builder validates it. */
export interface PromptSectionInput {
  name: string;
  role: string;
  source: string;
  chars: number;
  items: number;
  tokens?: number;
  fingerprint?: string;
  itemDetail?: { chars: number; tokens?: number; fingerprint?: string }[];
}

export interface PromptLogInput {
  component: PromptLogComponent;
  provider: string;
  model: string;
  correlation: {
    pr_id?: string;
    round_id?: string | null;
    run_id?: string;
    run_ids?: string[];
    request_id?: string;
    agent?: string;
  };
  review_mode?: string;
  chunk?: { index: number; count: number };
  sections: PromptSectionInput[];
}

export interface PromptLogSection {
  name: PromptSectionLogName;
  role: 'system' | 'user';
  source: 'trusted' | 'untrusted';
  chars: number;
  tokens?: number;
  items: number;
  fp?: string;
  item_detail?: { chars: number; tokens?: number; fp?: string }[];
}

export interface PromptLogRecord {
  event: 'prompt.assembled';
  v: 1;
  component: PromptLogComponent;
  log_mode: 'summary' | 'verbose';
  provider: string;
  model: string;
  correlation: {
    pr_id?: string;
    round_id?: string;
    run_id?: string;
    run_ids?: string[];
    request_id?: string;
    agent?: string;
  };
  review_mode?: 'single-pass' | 'map-reduce';
  chunk?: { index: number; count: number };
  sections: PromptLogSection[];
  totals: { chars: number; tokens?: number };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{8}$/;
const MODEL = /^[\w./:@-]{1,100}$/;
const REQUEST_ID = /^[\w.-]{1,64}$/;
const MAX_RUN_IDS = 50;
const MAX_AGENT_CHARS = 64;

const uuidOrUndefined = (v: unknown): string | undefined =>
  typeof v === 'string' && UUID.test(v) ? v : undefined;

/** A non-negative integer, or 0: a size can never be NaN, negative or a string. */
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;

const countOrUndefined = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : undefined;

function sectionName(component: PromptLogComponent, name: string): PromptSectionLogName {
  const allowed: readonly string[] = PROMPT_SECTION_LOG_NAMES[component];
  return allowed.includes(name) ? (name as PromptSectionLogName) : 'other';
}

function buildSection(
  component: PromptLogComponent,
  s: PromptSectionInput,
  verbose: boolean,
): PromptLogSection {
  const out: PromptLogSection = {
    name: sectionName(component, s.name),
    role: s.role === 'system' ? 'system' : 'user',
    // Fail closed: anything not explicitly trusted is reported as untrusted.
    source: s.source === 'trusted' ? 'trusted' : 'untrusted',
    chars: count(s.chars),
    items: count(s.items),
  };
  const tokens = countOrUndefined(s.tokens);
  if (tokens !== undefined) out.tokens = tokens;
  if (verbose) {
    if (typeof s.fingerprint === 'string' && FINGERPRINT.test(s.fingerprint)) out.fp = s.fingerprint;
    if (Array.isArray(s.itemDetail)) {
      out.item_detail = s.itemDetail.map((d) => {
        const detail: NonNullable<PromptLogSection['item_detail']>[number] = { chars: count(d.chars) };
        const itemTokens = countOrUndefined(d.tokens);
        if (itemTokens !== undefined) detail.tokens = itemTokens;
        if (typeof d.fingerprint === 'string' && FINGERPRINT.test(d.fingerprint)) {
          detail.fp = d.fingerprint;
        }
        return detail;
      });
    }
  }
  return out;
}

/**
 * Build the log record from raw parts. Every field is copied individually and
 * validated; nothing is spread. `summary` drops `fp` and `item_detail` even when
 * the input carries them (defence in depth).
 */
export function buildPromptLogRecord(
  input: PromptLogInput,
  mode: 'summary' | 'verbose',
): PromptLogRecord {
  const verbose = mode === 'verbose';
  const sections = input.sections.map((s) => buildSection(input.component, s, verbose));

  const correlation: PromptLogRecord['correlation'] = {};
  const prId = uuidOrUndefined(input.correlation.pr_id);
  if (prId) correlation.pr_id = prId;
  const roundId = uuidOrUndefined(input.correlation.round_id);
  if (roundId) correlation.round_id = roundId;
  const runId = uuidOrUndefined(input.correlation.run_id);
  if (runId) correlation.run_id = runId;
  if (Array.isArray(input.correlation.run_ids)) {
    const runIds = input.correlation.run_ids
      .map(uuidOrUndefined)
      .filter((id): id is string => id !== undefined)
      .slice(0, MAX_RUN_IDS);
    if (runIds.length > 0) correlation.run_ids = runIds;
  }
  const requestId = input.correlation.request_id;
  if (typeof requestId === 'string' && REQUEST_ID.test(requestId)) correlation.request_id = requestId;
  if (typeof input.correlation.agent === 'string') {
    // Agent names are user-set config, not prompt content: strip control chars, cap the length.
    const agent = input.correlation.agent
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, MAX_AGENT_CHARS);
    if (agent) correlation.agent = agent;
  }

  const providerParsed = Provider.safeParse(input.provider);
  const record: PromptLogRecord = {
    event: 'prompt.assembled',
    v: 1,
    component: input.component,
    log_mode: mode,
    provider: providerParsed.success ? providerParsed.data : 'unknown',
    model: MODEL.test(input.model) ? input.model : 'unknown',
    correlation,
    sections,
    totals: { chars: sections.reduce((n, s) => n + s.chars, 0) },
  };
  if (input.review_mode === 'single-pass' || input.review_mode === 'map-reduce') {
    record.review_mode = input.review_mode;
  }
  if (input.chunk) {
    record.chunk = { index: count(input.chunk.index), count: count(input.chunk.count) };
  }
  const withTokens = sections.filter((s) => s.tokens !== undefined);
  if (withTokens.length > 0) {
    record.totals.tokens = withTokens.reduce((n, s) => n + (s.tokens ?? 0), 0);
  }
  return record;
}

/**
 * Write the record to the pino logger. Logging never fails a run or a request:
 * a throwing logger is swallowed (same rule as best-effort enrichment).
 */
export function emitPromptLog(
  logger: { info(obj: unknown, msg?: string): void },
  record: PromptLogRecord,
): void {
  try {
    logger.info(record, 'prompt assembled');
  } catch {
    /* never fail a run over a log line */
  }
}

/**
 * Build AND emit, never throwing: a builder failure is swallowed too. Callers
 * use this so a bug in record building can not fail a review either.
 */
export function logPromptAssembled(
  logger: { info(obj: unknown, msg?: string): void },
  input: PromptLogInput,
  mode: 'summary' | 'verbose',
): void {
  try {
    emitPromptLog(logger, buildPromptLogRecord(input, mode));
  } catch {
    /* never fail a run over a log line */
  }
}
