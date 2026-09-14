import { wrapUntrusted } from '@devdigest/reviewer-core';

/**
 * specs/09-project-context-folder.md — renderer for the skill Preview tab's
 * `## Project context` block (`GET /skills/:id/preview`, AC-13/D1). Lives in
 * `_shared` (exempt from `no-cross-module`, same reason as `skill-render.ts`)
 * for skills-module use.
 *
 * A run itself (run-executor.ts / adhoc.ts) does NOT call this — it hands raw
 * documents straight to reviewer-core's `assemblePrompt`, which independently
 * renders the identical `## Project context` heading + per-document
 * `wrapUntrusted(path, content)` join. reviewer-core cannot import this file
 * (pure-engine constraint, `reviewer-core/CLAUDE.md`), so the two copies are
 * kept in sync by using the SAME `wrapUntrusted` export and matching logic
 * by hand, not by one function serving both call sites. If either copy's
 * formatting changes without the other, the skill Preview tab starts lying
 * about what a run actually injects — check `reviewer-core/src/prompt.ts`'s
 * `specs` rendering (around the `## Project context` heading) whenever this
 * function changes, and vice versa.
 */

/** The minimal shape this renderer needs from a resolved document. */
export interface RenderableDocument {
  path: string;
  content: string;
}

/**
 * `null` when `docs` is empty — mirrors `assemblePrompt`'s omit-when-empty
 * contract for every optional prompt section (AC-16, AC-34): a skill/agent
 * with nothing attached shows no `## Project context` block in preview,
 * matching a run's assembled prompt exactly.
 */
export function renderProjectContextBlock(docs: RenderableDocument[]): string | null {
  if (docs.length === 0) return null;
  const body = docs.map((d) => wrapUntrusted(d.path, d.content)).join('\n\n');
  return `## Project context\n${body}`;
}
