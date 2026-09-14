import type { SkillVersion } from "@devdigest/shared";

export interface VersionRow {
  version: number;
  createdAt: string;
  body: string;
  /** Bytes gained/lost versus the version immediately before it; null for the oldest. */
  delta: number | null;
}

/** UTF-8 byte length — what "body size" means on the wire and in the DB. */
export function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Newest first, each row carrying its size delta against the previous version.
 * The server already sorts, but a tab that silently mis-orders history is
 * worse than a redundant sort.
 */
export function versionRows(versions: SkillVersion[]): VersionRow[] {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return sorted.map((v, i) => {
    const older = sorted[i + 1];
    return {
      version: v.version,
      createdAt: v.created_at,
      body: v.body,
      delta: older ? byteSize(v.body) - byteSize(older.body) : null,
    };
  });
}

/** "+412" / "−88" — sign is explicit so a shrink is never read as a growth. */
export function deltaSign(delta: number): string {
  return delta > 0 ? "+" : delta < 0 ? "−" : "±";
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
