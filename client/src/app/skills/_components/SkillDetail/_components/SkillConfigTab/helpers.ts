/** Number of lines in the editor (a trailing newline starts a new, empty line). */
export function countLines(text: string): number {
  return text.split("\n").length;
}

/** Line numbers 1..n for the editor gutter. */
export function lineNumbers(text: string): number[] {
  return Array.from({ length: countLines(text) }, (_, i) => i + 1);
}

/** `<name>.md` shown in the editor's file header. */
export function fileNameFor(name: string): string {
  return `${name.trim() || "skill"}.md`;
}
