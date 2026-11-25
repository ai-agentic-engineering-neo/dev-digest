/** Pure helpers for the DiffViewer. */
import type { PrFile } from "@/lib/types";
import { dedupeKeys } from "@/lib/stable-keys";
import { HUNK_HEADER_RE } from "./constants";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
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

/** React key per parsed line, from its line numbers rather than its position.
 *  Within one well-formed patch, newNo strictly increases over add lines, oldNo
 *  over del lines, and the (oldNo, newNo) pair over context lines, so the
 *  kind-prefixed numbers are unique (an add and a del may share a number; the
 *  prefix separates them). Hunk headers carry no numbers and key by their text.
 *  A malformed patch (overlapping hunks) could still repeat one, so a repeat
 *  gets an occurrence suffix instead of becoming a duplicate key. */
export function lineKeys(lines: readonly Line[]): string[] {
  return dedupeKeys(
    lines.map((ln) =>
      ln.kind === "add"
        ? `a${ln.newNo}`
        : ln.kind === "del"
          ? `d${ln.oldNo}`
          : ln.kind === "ctx"
            ? `c${ln.oldNo}:${ln.newNo}`
            : `h${ln.text}`,
    ),
  );
}

/** React key per file: its path, which identifies the file within a PR (GitHub
 *  lists each filename once), so a FileCard's open/collapsed state follows the
 *  file when the list is reordered or filtered. pr_files has no DB uniqueness on
 *  (pr_id, path), so a repeated path gets an occurrence suffix instead of
 *  producing a duplicate key. */
export function fileKeys(files: readonly Pick<PrFile, "path">[]): string[] {
  return dedupeKeys(files.map((f) => f.path));
}
