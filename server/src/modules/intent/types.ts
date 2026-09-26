/**
 * L03 — intent module's public facade. Other modules (reviews) reach it only
 * through `container.intent`, never by importing `./service.js` directly
 * (onion-architecture §4/§5 — cross-module access goes through the container).
 */
import type { PrIntentRecord } from '@devdigest/shared';

export type IntentEventKind = 'info' | 'tool' | 'result' | 'error';

/** Minimal pino-compatible logger (matches platform/run-logger.ts's PinoLike). */
export interface IntentLoggerLike {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export interface DeriveOptions {
  /** Bypass the input-hash cache and force a fresh classification. */
  force: boolean;
  /** Selects the timeout/retry budget: 'on-demand' (routes.ts, the user is
      staring at a spinner) vs 'review' (run-executor pre-work, no retry). */
  budget: 'on-demand' | 'review';
  /** Live-log sink (RunLogger.event-shaped) — used by the review pre-work
      path to fan events into every queued run's Live Log / trace. */
  onEvent?: (kind: IntentEventKind, msg: string) => void;
  /** Structured stdout logger for ops (pino). */
  logger?: IntentLoggerLike;
  /** L03 — review pre-work only: the run ids queued for this classification,
      logged as `run_ids` on the prompt-log record. Undefined for on-demand
      derives (routes.ts). */
  runIds?: string[];
}

export interface DeriveResult {
  record: PrIntentRecord;
  /** `true` when the stored record's input_hash already matched (no LLM call
      was made this time — including when a concurrent derive was in flight
      and this call awaited its result). */
  cached: boolean;
}

export interface IntentLayer {
  /** The persisted intent for a PR (or `null` if never derived), with `stale`
      computed against the PR's current title/body/head_sha. */
  get(workspaceId: string, prId: string): Promise<PrIntentRecord | null>;
  /** Derive (or return the cached) intent for a PR. Single-flight per prId
      for non-`force` calls. */
  derive(workspaceId: string, prId: string, opts: DeriveOptions): Promise<DeriveResult>;
}
