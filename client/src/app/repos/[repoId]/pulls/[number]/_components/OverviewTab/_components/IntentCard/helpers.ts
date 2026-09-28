import type { IntentSource, IntentSourceKind } from "@devdigest/shared";

/** Split the stored `sources` into what was actually used (or truncated) and
 * what the derivation deliberately never fetched. */
export function splitSources(sources: IntentSource[]): {
  used: IntentSource[];
  unresolved: IntentSource[];
} {
  return {
    used: sources.filter((s) => s.status !== "unresolved"),
    unresolved: sources.filter((s) => s.status === "unresolved"),
  };
}

const FIXED_LABEL_KINDS: readonly IntentSourceKind[] = [
  "pr_title",
  "pr_body",
  "branch_name",
  "commit_messages",
  "changed_files",
  "labels",
];

/** `linked_doc` / `ticket_ref` / `external_link` / `linked_issue` show their
 * own ref (a path, key, URL or issue number); everything else shows a fixed,
 * translated label (`intent.sourceKind.*`). */
export function isFixedSourceLabel(kind: IntentSourceKind): boolean {
  return (FIXED_LABEL_KINDS as readonly string[]).includes(kind);
}

export function sourceRefText(source: IntentSource): string {
  return source.kind === "linked_issue" ? `#${source.ref}` : source.ref;
}

export function sortBySourceOrder<T extends { kind: IntentSourceKind }>(
  items: T[],
  order: readonly IntentSourceKind[],
): T[] {
  return [...items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
