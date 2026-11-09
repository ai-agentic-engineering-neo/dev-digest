/* Deep-link target types for Files changed (SPEC-07). */

/** Inclusive new-side line range of a deep-link target: start >= 1, end >= start (one line: end === start). */
export interface LineRange {
  start: number;
  end: number;
}

/** Opens a changed file in Files changed. `lines` null/absent = file-level target (header only, SPEC-06 AC-9). */
export type OpenDiffTarget = (path: string, lines?: LineRange | null) => void;
