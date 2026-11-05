/** Human-readable message for anything thrown / rejected (not only Error instances). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return "Something went wrong";
}

/**
 * `useMutation({ meta: OWN_ERROR_TOAST })` — every caller of this mutation shows
 * its own (contextual) error, so the global MutationCache toast must stay quiet;
 * otherwise a failure shows two toasts. Only for hooks whose callers ALL handle errors.
 */
export const OWN_ERROR_TOAST = { ownErrorToast: true } as const;

export function hasOwnErrorToast(meta: Record<string, unknown> | undefined): boolean {
  return meta?.ownErrorToast === true;
}
