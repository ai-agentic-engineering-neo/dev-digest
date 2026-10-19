/** How a body line is tinted in the editor overlay. */
export type LineKind = "heading" | "fence" | "text";

/** Classify markdown lines; lines inside a ``` fence are tinted as code. */
export function classifyLines(body: string): { text: string; kind: LineKind }[] {
  let inFence = false;
  return body.split("\n").map((text) => {
    if (/^\s*```/.test(text)) {
      inFence = !inFence;
      return { text, kind: "fence" };
    }
    if (inFence) return { text, kind: "fence" };
    return { text, kind: /^#{1,6}\s/.test(text) ? "heading" : "text" };
  });
}
