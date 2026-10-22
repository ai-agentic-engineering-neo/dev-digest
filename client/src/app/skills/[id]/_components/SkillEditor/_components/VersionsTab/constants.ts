import type { DiffLineKind } from "./helpers";

/** Gutter mark per diff line kind. */
export const MARK: Record<DiffLineKind, string> = { add: "+", del: "-", same: " " };
