/**
 * specs/09-project-context-folder.md — Q4: the doc-type label is a rendering
 * of the matched root's last path segment, not a new taxonomy. The mockup's
 * three fixed labels ('specs'/'docs'/'insights') get their own color; any
 * other label (a repo with a custom search root) renders with the neutral
 * default — the server never restricts what a label can be.
 */
export const DOC_TYPE_COLOR: Record<string, { color: string; bg: string }> = {
  specs: { color: "var(--accent)", bg: "var(--accent-bg)" },
  docs: { color: "var(--info)", bg: "var(--info-bg)" },
  insights: { color: "var(--ok)", bg: "var(--ok-bg)" },
};

export const DEFAULT_DOC_TYPE_COLOR = { color: "var(--text-secondary)", bg: "var(--bg-hover)" };

export function docTypeColor(docType: string): { color: string; bg: string } {
  return DOC_TYPE_COLOR[docType] ?? DEFAULT_DOC_TYPE_COLOR;
}
