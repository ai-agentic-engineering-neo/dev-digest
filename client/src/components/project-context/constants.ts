import type { ContextDocType } from "@devdigest/shared";

/** Document type → badge colour (text carries the type too, so not colour-only). */
export const DOC_TYPE_COLOR: Record<ContextDocType, string> = {
  specs: "var(--accent)",
  docs: "#10b981",
  insights: "#f59e0b",
  other: "var(--text-muted)",
};

/** Above this many effective tokens the agent tab warns about per-run size/cost. */
export const LARGE_CONTEXT_TOKENS = 8_000;
