/**
 * Shared review pre-work: derive (or reuse) the PR's intent before the agent
 * loop (server/specs/05-intent-layer.md). Runs ONCE per `POST /pulls/:id/review`
 * request, fanned out to every queued run's log/trace — same shape as
 * `loadDiff` in `diff-loader.ts`. NEVER throws: the kill switch off, no
 * `IntentResolver` wired, or any failure all degrade to `{}` (the review runs
 * without intent, exactly like before this feature).
 */
import type { Intent, IntentTrace, RunEventKind, UnifiedDiff } from '@devdigest/shared';
import type { ReviewPull, ReviewRepo } from '../domain/types.js';
import type { IntentResolver } from './ports.js';

export interface IntentPreworkResult {
  intent?: Intent;
  intentTrace?: IntentTrace;
}

function warningTrace(warning: string): IntentTrace {
  return { status: 'unavailable', warning };
}

export async function resolveIntentPrework(
  intentResolver: IntentResolver | undefined,
  workspaceId: string,
  pull: ReviewPull,
  repo: ReviewRepo,
  diff: UnifiedDiff,
  emit: (kind: RunEventKind, msg: string, data?: unknown) => void,
  /** Aborts only once every run sharing this pre-work has been cancelled — a
   *  single cancel must not starve the others (server/specs/05-intent-layer.md,
   *  "Budget"). Combined with the service's own 30s budget internally. */
  signal?: AbortSignal,
): Promise<IntentPreworkResult> {
  if (!intentResolver) return {};
  try {
    const result = await intentResolver.resolveForReview({
      workspaceId,
      pull,
      repo,
      changedFiles: diff.files.map((f) => f.path),
      diffExcerpt: diff.raw,
      onEvent: (e) => emit(e.kind, e.msg, e.data),
      signal,
    });
    // A `status:'unavailable'` result already logged its own `warning: intent
    // unavailable — …` line (IntentService.resolveForReview) — don't duplicate it.
    if (result.status === 'unavailable') return { intentTrace: warningTrace(result.warning) };
    return { intent: result.intent, intentTrace: result.trace };
  } catch (err) {
    // Truly unexpected (the resolver's own contract is to never throw) — still
    // never fails the review.
    const warning = err instanceof Error ? err.message : String(err);
    emit('info', `warning: intent unavailable — ${warning}`, { warning: 'intent_unavailable' });
    return { intentTrace: warningTrace(warning) };
  }
}
