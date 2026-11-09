/** Pure helpers for the DiffViewer. */
import { HUNK_HEADER_RE } from "./constants";
import type { LineRange } from "./focus";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/**
 * Resolve a new-side line range against parsed lines: the target row is the first add/ctx row whose
 * newNo equals range.start; highlighted rows are every add/ctx row inside the range.
 * Null when the start line is not rendered (outside hunks, removed-only, no patch).
 */
export function findLineTarget(
  lines: Line[],
  range: LineRange
): { targetIndex: number; highlighted: ReadonlySet<number> } | null {
  const targetIndex = lines.findIndex(
    (ln) => (ln.kind === "add" || ln.kind === "ctx") && ln.newNo === range.start
  );
  if (targetIndex === -1) return null;
  const highlighted = new Set<number>();
  lines.forEach((ln, i) => {
    if ((ln.kind === "add" || ln.kind === "ctx") && ln.newNo !== undefined) {
      if (ln.newNo >= range.start && ln.newNo <= range.end) highlighted.add(i);
    }
  });
  return { targetIndex, highlighted };
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}
