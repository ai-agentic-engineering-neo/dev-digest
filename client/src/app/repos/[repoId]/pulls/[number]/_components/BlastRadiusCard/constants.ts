/* Mirrors of shared values and the graph's size caps. Runtime values must not
   be imported from @devdigest/shared in client code (the barrel breaks the dev
   server), so the reason codes live here; the type-only import keeps them in
   step with the contract. */
import type { BlastDegradedReason } from "@devdigest/shared";

export type BlastView = "tree" | "graph";

/** Degraded reasons that have a translated body under `blast.empty.*`. */
export const DEGRADED_REASONS: ReadonlySet<BlastDegradedReason> = new Set<BlastDegradedReason>([
  "flag_off",
  "index_failed",
  "index_partial",
  "repo_too_large",
  "no_data",
]);

/** Symbol kinds rendered as `name()`; everything else is shown bare. */
export const CALLABLE_KINDS: ReadonlySet<string> = new Set(["function", "method"]);

/** Graph caps: beyond these a single "+N more" node stands in. */
export const GRAPH_MAX_SYMBOLS = 6;
export const GRAPH_MAX_CALLERS = 10;
export const GRAPH_MAX_TARGETS = 8;
