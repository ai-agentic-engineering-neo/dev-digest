import type { IntentConfidence } from "@devdigest/shared";

/** Badge colours by confidence; low uses the warning tokens. */
export function confidenceTone(level: IntentConfidence): { color: string; bg: string } {
  if (level === "low") return { color: "var(--warn)", bg: "var(--warn-bg)" };
  if (level === "medium") return { color: "var(--info)", bg: "var(--info-bg)" };
  return { color: "var(--ok)", bg: "var(--bg-hover)" };
}
