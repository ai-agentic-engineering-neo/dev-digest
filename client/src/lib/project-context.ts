/* project-context.ts — domain helpers for Project Context (SPEC-01). Caps and
   kinds are mirrored from the server contract (client imports only types from
   @devdigest/shared); keep them equal to server/src/modules/project-context. */
import type { SpecFile } from "@devdigest/shared";

/** Summed tokens of the attached documents one prompt may carry. */
export const PROJECT_CONTEXT_RUN_MAX_TOKENS = 24_000;
/** Longest text an override may hold, in characters (mirrors the server cap). */
export const PROJECT_CONTEXT_FILE_MAX_CHARS = 200_000;
/** Folders discovery looks under; named in the empty state. */
export const DISCOVERY_ROOTS = ["specs", "docs", "insights"] as const;

/**
 * Repo the attach panels and the page start on: the only repository, or, with
 * several, the app's active repository (URL, then localStorage, then the first,
 * as the shell resolves it). Null when there is no repository.
 */
export function defaultContextRepoId(repos: ReadonlyArray<{ id: string }>, activeRepoId: string | null): string | null {
  if (repos.length === 0) return null;
  if (repos.length === 1) return repos[0]!.id;
  if (activeRepoId && repos.some((r) => r.id === activeRepoId)) return activeRepoId;
  return repos[0]!.id;
}

/** Tokens of the checked paths that are in the listing (missing or too large rows count nothing). */
export function sumCheckedTokens(checked: readonly string[], files: ReadonlyArray<Pick<SpecFile, "path" | "tokens">>): number {
  const byPath = new Map(files.map((f) => [f.path, f.tokens ?? 0]));
  return checked.reduce((n, p) => n + (byPath.get(p) ?? 0), 0);
}

export function isOverPromptCap(total: number): boolean {
  return total > PROJECT_CONTEXT_RUN_MAX_TOKENS;
}

/** The skill tab's read-only block: `## Project context` and one path line per document. */
export function serializeContextBlock(paths: readonly string[]): string {
  return ["## Project context", ...paths].join("\n");
}

export function isOverFileCap(draft: string): boolean {
  return draft.length > PROJECT_CONTEXT_FILE_MAX_CHARS;
}

/** Save is allowed while the draft differs from the effective text and is within the cap (AC-60). */
export function canSaveDraft(draft: string, effective: string): boolean {
  return draft !== effective && !isOverFileCap(draft);
}
