/**
 * specs/14-export-to-ci.md (P2) — repo-scoped memory rows → the bundle's
 * `.devdigest/memory.jsonl` file. Pure: no DB (that lives in
 * `modules/memory/repository.ts`), no HTTP, no LLM.
 *
 * D16/N15/N16 — one JSON object per line, carrying ONLY `kind`/`content`.
 * Never `embedding` (large, useless to the runner), never `sources` (holds
 * internal finding identifiers), never `confidence`. This file lands in a
 * repository DevDigest does not own — the narrow shape is a privacy
 * decision, not a laziness one.
 */

export interface MemoryExportRow {
  kind: string;
  content: string;
}

/** AC-58a — zero rows still produces a valid, parseable empty document,
 *  never an omission and never a failure: an empty string. */
export function buildMemoryJsonl(rows: readonly MemoryExportRow[]): string {
  if (rows.length === 0) return '';
  return rows.map((r) => JSON.stringify({ kind: r.kind, content: r.content })).join('\n') + '\n';
}

/** Parse a `.jsonl` memory export back into rows — used by the P2 gate
 *  script (and available to tests) to prove AC-58/AC-58a's round-trip. */
export function parseMemoryJsonl(contents: string): MemoryExportRow[] {
  const text = contents.trim();
  if (text.length === 0) return [];
  return text.split('\n').map((line) => {
    const parsed = JSON.parse(line) as { kind: string; content: string };
    return { kind: parsed.kind, content: parsed.content };
  });
}
