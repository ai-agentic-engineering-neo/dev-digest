export type PatchLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

/**
 * Classify the lines of a unified diff by position: `---`/`+++`/`Index:`/`===`
 * are file headers only before the first `@@` hunk; afterwards a line starting
 * with `-` or `+` is a change even when the body line itself is `--` or `++`
 * (a removed Markdown rule `---` arrives as `----`).
 */
export function classifyPatch(patch: string): Array<{ text: string; kind: PatchLineKind }> {
  const lines = patch.replace(/\n$/, "").split("\n");
  let inHunk = false;
  return lines.map((text) => {
    if (text.startsWith("@@")) {
      inHunk = true;
      return { text, kind: "hunk" as const };
    }
    if (!inHunk && (text.startsWith("+++") || text.startsWith("---") || text.startsWith("Index:") || text.startsWith("==="))) {
      return { text, kind: "meta" as const };
    }
    if (inHunk && text.startsWith("+")) return { text, kind: "add" as const };
    if (inHunk && text.startsWith("-")) return { text, kind: "del" as const };
    return { text, kind: (inHunk ? "ctx" : "meta") as PatchLineKind };
  });
}
