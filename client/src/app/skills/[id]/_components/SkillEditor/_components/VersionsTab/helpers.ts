import { diffLines } from "diff";

export type DiffLineKind = "add" | "del" | "same";
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** Line diff from `from` (an older version) to `to` (the current body). */
export function toDiffLines(from: string, to: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const part of diffLines(from, to)) {
    const kind: DiffLineKind = part.added ? "add" : part.removed ? "del" : "same";
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) out.push({ kind, text });
  }
  return out;
}

export function hasChanges(lines: DiffLine[]): boolean {
  return lines.some((l) => l.kind !== "same");
}
