import type { IntentConfidence } from "@/lib/types";

export const CONFIDENCE_TONE: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  medium: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  low: { color: "var(--warn)", bg: "var(--warn-bg)" },
};

export const SHORT_SHA_LENGTH = 7;
export const INTENT_MAX_CHARS = 400;
export const SCOPE_MAX_ITEMS = 8;
