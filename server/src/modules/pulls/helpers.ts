/** Helpers for the pulls module (PR list rollups). */

/** Max finding previews shipped per PR on the list endpoint (popover only). */
export const PREVIEW_LIMIT = 10;

const EXCERPT_CHARS = 200;

/**
 * Plain-text excerpt of a markdown rationale for the PR-list popover: first
 * paragraph, inline code/emphasis markers stripped, cut at a word boundary
 * with an ellipsis. Never a model call — pure string work.
 */
export function previewExcerpt(markdown: string): string {
  const firstParagraph = markdown.trim().split(/\n\s*\n/)[0] ?? '';
  const plain = firstParagraph
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*>#]/g, '') // keep `_`: it is part of identifiers like sk_live_
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= EXCERPT_CHARS) return plain;
  const cut = plain.slice(0, EXCERPT_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > EXCERPT_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
