import type { IntentConfidence, IntentSourceStatus, PrIntentRecord } from "@devdigest/shared";

/**
 * A stored intent is stale when it was derived at a different head SHA than the
 * PR's current one. A record with no head SHA cannot be tied to any commit, so
 * it always counts as stale.
 */
export function isIntentStale(
  record: Pick<PrIntentRecord, "head_sha">,
  headSha: string | null | undefined,
): boolean {
  if (record.head_sha === null) return true;
  return headSha != null && record.head_sha !== headSha;
}

interface Tone {
  color: string;
  bg: string;
}

const CONFIDENCE_TONE: Record<IntentConfidence, Tone> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

/** Badge colours for a confidence level. The badge also spells the level in words. */
export function confidenceTone(confidence: IntentConfidence): Tone {
  return CONFIDENCE_TONE[confidence];
}

/** Badge colours for a source chip; only `unavailable` gets the warning tone. */
export function sourceTone(status: IntentSourceStatus): Tone | null {
  return status === "unavailable" ? { color: "var(--warn)", bg: "var(--warn-bg)" } : null;
}
