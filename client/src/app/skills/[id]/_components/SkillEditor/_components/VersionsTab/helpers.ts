import { diffLines } from "diff";

export interface DiffLine {
  kind: "add" | "del" | "same";
  text: string;
}

/** jsdiff compares whole lines incl. their "\n", so a last line without one
 *  would differ from the same line followed by more text. */
function withEol(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** Line diff from an old version's body to the current one (jsdiff). Lines
 *  only in the current body are "add", lines only in the old one are "del". */
export function lineDiff(from: string, to: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const part of diffLines(withEol(from), withEol(to))) {
    const kind = part.added ? "add" : part.removed ? "del" : "same";
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) out.push({ kind, text });
  }
  return out;
}

/** Whether the diff has any change at all. */
export function hasChanges(lines: readonly DiffLine[]): boolean {
  return lines.some((l) => l.kind !== "same");
}

/** A version's timestamp in the viewer's locale (the raw value if unparsable). */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
