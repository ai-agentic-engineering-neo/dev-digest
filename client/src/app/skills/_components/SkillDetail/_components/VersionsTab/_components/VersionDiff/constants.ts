import type { DiffKind } from "../../helpers";

/** Gutter marker per diff line kind. */
export const DIFF_PREFIX: Record<DiffKind, string> = { add: "+", del: "-", same: " " };
