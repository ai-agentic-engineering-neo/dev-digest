import type { ConventionCandidate } from "@devdigest/shared";

/** Elapsed time since `iso`, bucketed for the "last scan …" subtitle. */
export type Ago = { unit: "now" } | { unit: "m" | "h" | "d"; n: number };

export function agoParts(iso: string | null | undefined, now = Date.now()): Ago | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const m = Math.max(0, Math.round((now - then) / 60_000));
  if (m < 1) return { unit: "now" };
  if (m < 60) return { unit: "m", n: m };
  const h = Math.round(m / 60);
  if (h < 24) return { unit: "h", n: h };
  return { unit: "d", n: Math.round(h / 24) };
}

export function countByStatus(items: ConventionCandidate[]) {
  return {
    pending: items.filter((i) => i.status === "pending").length,
    accepted: items.filter((i) => i.status === "accepted").length,
  };
}
