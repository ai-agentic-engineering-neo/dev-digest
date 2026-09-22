/* query-meta.ts — typed `meta` for TanStack mutations.
   The global MutationCache (providers.tsx) toasts every mutation error. A
   mutation that shows some errors itself (inline in a modal, or a dedicated
   toast) lists their ApiError codes in `meta.quietErrorCodes`; "*" silences
   every error of that mutation. */
import { ApiError } from "./api";

export interface MutationMeta extends Record<string, unknown> {
  /** ApiError codes the caller surfaces itself; "*" = all errors. */
  quietErrorCodes?: readonly string[];
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: MutationMeta;
  }
}

/** Whether the global error toast should stay silent for this error. */
export function isQuietError(err: unknown, meta: MutationMeta | undefined): boolean {
  const codes = meta?.quietErrorCodes;
  if (!codes?.length) return false;
  if (codes.includes("*")) return true;
  return err instanceof ApiError && err.code != null && codes.includes(err.code);
}
