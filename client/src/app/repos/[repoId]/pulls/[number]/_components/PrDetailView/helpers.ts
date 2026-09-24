import type { PrMeta, ReviewRecord } from "@devdigest/shared";
import { DEFAULT_TAB, PR_TABS, type PrTab } from "./constants";

/** The route is keyed by PR number, every PR API by the row's uuid: resolve it from the pulls list. */
export function findPrId(pulls: readonly Pick<PrMeta, "id" | "number">[] | undefined, number: string): string | null {
  return pulls?.find((p) => p.number === Number(number))?.id ?? null;
}

/** Total findings across all review runs (the "Agent runs" tab counter). */
export function countFindings(reviews: readonly ReviewRecord[] | undefined): number {
  return (reviews ?? []).reduce((n, r) => n + r.findings.length, 0);
}

/** Unknown / missing ?tab values fall back to the default tab. */
export function parseTab(raw: string | null): PrTab {
  return (PR_TABS as readonly string[]).includes(raw ?? "") ? (raw as PrTab) : DEFAULT_TAB;
}

/** `search` with `key` set (or removed when `value` is null), as "?…" or "" when empty. */
export function withSearchParam(search: string, key: string, value: string | null): string {
  const sp = new URLSearchParams(search);
  if (value == null) sp.delete(key);
  else sp.set(key, value);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function prDetailPath(repoId: string, number: string): string {
  return `/repos/${repoId}/pulls/${number}`;
}
