/** Pure tokenizer for the editor's highlight overlay. No React, no DOM. */

export type TokenKind = "text" | "heading" | "bold" | "bullet" | "fence" | "code";

export interface HlToken {
  text: string;
  kind: TokenKind;
}

const HEADING_RE = /^\s{0,3}#{1,6}\s/;
const BULLET_RE = /^(\s*)([-*+]|\d+\.)(\s+)/;
const FENCE_RE = /^\s*```/;

/** Split inline `**bold**` runs out of a plain-text segment. */
function splitBold(text: string): HlToken[] {
  const out: HlToken[] = [];
  const re = /\*\*[^*\n]+\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: "text" });
    out.push({ text: m[0], kind: "bold" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: "text" });
  return out;
}

/**
 * Markdown highlighting, four rules only: ATX heading, bold, list bullet and
 * fenced code. Anything richer belongs to a real editor dependency, and one
 * field does not justify ~200 KB of CodeMirror.
 *
 * Returns one token array per source line — the overlay renders them in the
 * same order, so the text under the caret always matches the textarea.
 */
export function highlightMarkdown(body: string): HlToken[][] {
  let inFence = false;
  return body.split("\n").map((line) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return [{ text: line, kind: "fence" as const }];
    }
    if (inFence) return [{ text: line, kind: "code" as const }];
    if (line === "") return [];
    if (HEADING_RE.test(line)) return [{ text: line, kind: "heading" as const }];

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      const marker = `${bullet[1] ?? ""}${bullet[2] ?? ""}${bullet[3] ?? ""}`;
      return [{ text: marker, kind: "bullet" as const }, ...splitBold(line.slice(marker.length))];
    }
    return splitBold(line);
  });
}

/** Line count as the gutter must render it — an empty body is still one line. */
export function lineCount(body: string): number {
  return body.split("\n").length;
}

/** `pr-quality-rubric` → `pr-quality-rubric.md`; blank slug stays honest. */
export function skillFilename(slug: string): string {
  return `${slug || "untitled"}.md`;
}
