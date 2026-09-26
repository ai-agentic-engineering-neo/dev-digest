/**
 * platform/prompt-log.ts — cross-cutting runtime machinery (L03 prompt
 * logging), not a ring. A pure module: no I/O, no `await`, no `container`
 * import. It builds a text-free log record from prompt-assembly metadata —
 * METADATA ONLY, NEVER SECTION TEXT. The only "impure-looking" import is
 * `node:crypto`'s `createHash`, used purely (no filesystem/network), same
 * precedent as `modules/intent/helpers.ts`.
 */
import { createHash } from 'node:crypto';

export type PromptLogMode = 'summary' | 'verbose';

/** The one message every prompt-log record is written with. */
export const PROMPT_LOG_MSG = 'prompt: assembled';

/** One section's metadata, as logged. `fingerprint` / `ref` are stripped in
 *  summary mode by `toPromptLogRecord` regardless of whether the caller set
 *  them — the mode is the single source of truth for what leaves the process. */
export interface PromptLogSection {
  name: string;
  source: string;
  role: 'system' | 'user';
  untrusted: boolean;
  chars: number;
  tokens_est: number;
  fingerprint?: string;
  /** Intent classifier sections only; `null` for title/branch/external_link kinds. */
  ref?: string | null;
}

/** Everything a caller (review run wiring, intent classifier) can supply.
 *  `toPromptLogRecord` decides, from `mode` alone, which of the verbose-only
 *  fields actually reach the logger. */
export interface PromptLogInput {
  feature: 'review' | 'intent';
  scope: 'run' | 'chunk' | 'classifier';
  correlation_id: string;
  pr_id: string;
  /** Review only. */
  run_id?: string;
  /** Intent, when derived from review pre-work. */
  run_ids?: string[];
  /** Review only (no agent in the intent classifier). */
  agent?: string;
  provider: string;
  model: string;
  /** Review only. */
  mode?: string;
  chunk_count?: number;
  chunk_index?: number;
  /** Verbose only. */
  chunk_label?: string;
  system_chars: number;
  user_chars: number;
  total_chars: number;
  tokens_est: number;
  sections: PromptLogSection[];
  /** Verbose, run scope only. */
  diff_files?: { path: string; chars: number }[];
  /** Verbose only — enabled skill names. */
  skills?: string[];
}

export interface PromptLogRecord {
  event: 'prompt.assembled';
  prompt_log: PromptLogMode;
  feature: 'review' | 'intent';
  scope: 'run' | 'chunk' | 'classifier';
  correlation_id: string;
  pr_id: string;
  run_id?: string;
  run_ids?: string[];
  agent?: string;
  provider: string;
  model: string;
  mode?: string;
  chunk_count?: number;
  chunk_index?: number;
  chunk_label?: string;
  system_chars: number;
  user_chars: number;
  total_chars: number;
  tokens_est: number;
  sections: PromptLogSection[];
  diff_files?: { path: string; chars: number }[];
  skills?: string[];
}

/** 12 lowercase hex chars of a sha256 digest — short enough to eyeball a
 *  diff, long enough that two unrelated sections won't collide by chance. */
export function fingerprintText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * Build the log record from `input`, field by field (never `{ ...input }` —
 * a future field on `PromptLogInput` must not leak into a log line without
 * an explicit decision here). In `summary` mode, `sections[].fingerprint`,
 * `sections[].ref`, `chunk_label`, `diff_files` and `skills` are omitted.
 */
export function toPromptLogRecord(input: PromptLogInput, mode: PromptLogMode): PromptLogRecord {
  const verbose = mode === 'verbose';
  return {
    event: 'prompt.assembled',
    prompt_log: mode,
    feature: input.feature,
    scope: input.scope,
    correlation_id: input.correlation_id,
    pr_id: input.pr_id,
    ...(input.run_id !== undefined ? { run_id: input.run_id } : {}),
    ...(input.run_ids !== undefined ? { run_ids: input.run_ids } : {}),
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
    provider: input.provider,
    model: input.model,
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.chunk_count !== undefined ? { chunk_count: input.chunk_count } : {}),
    ...(input.chunk_index !== undefined ? { chunk_index: input.chunk_index } : {}),
    ...(verbose && input.chunk_label !== undefined ? { chunk_label: input.chunk_label } : {}),
    system_chars: input.system_chars,
    user_chars: input.user_chars,
    total_chars: input.total_chars,
    tokens_est: input.tokens_est,
    sections: input.sections.map((s) => ({
      name: s.name,
      source: s.source,
      role: s.role,
      untrusted: s.untrusted,
      chars: s.chars,
      tokens_est: s.tokens_est,
      ...(verbose && s.fingerprint !== undefined ? { fingerprint: s.fingerprint } : {}),
      ...(verbose && s.ref !== undefined ? { ref: s.ref } : {}),
    })),
    ...(verbose && input.diff_files !== undefined ? { diff_files: input.diff_files } : {}),
    ...(verbose && input.skills !== undefined ? { skills: input.skills } : {}),
  };
}

/**
 * Log one `'prompt: assembled'` record. A no-op without a logger; never
 * throws (a broken telemetry call must not break the caller's review /
 * classification).
 */
export function emitPromptLog(
  logger: { info(obj: unknown, msg?: string): void } | undefined,
  input: PromptLogInput,
  mode: PromptLogMode,
): void {
  if (!logger) return;
  try {
    logger.info(toPromptLogRecord(input, mode), PROMPT_LOG_MSG);
  } catch {
    // Telemetry must never break the caller.
  }
}
