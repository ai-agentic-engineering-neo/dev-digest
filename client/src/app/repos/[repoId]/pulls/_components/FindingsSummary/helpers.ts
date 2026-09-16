import type { Finding } from "@devdigest/shared";
import { SEVERITY_ORDER } from "@/lib/findings";

/** Findings sorted severity-first (CRITICAL → WARNING → SUGGESTION), for the popover list. */
export function sortedFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

const MAX_DESCRIPTION_LENGTH = 140;

/** A short, markdown-free description for a read-only preview card. */
export function shortDescription(rationale: string): string {
  const plain = rationale
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, "")) // inline/fenced code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links/images → label text
    .replace(/[*_#>-]+/g, " ") // emphasis/heading/quote/list markers
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= MAX_DESCRIPTION_LENGTH) return plain;
  return `${plain.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd()}…`;
}
