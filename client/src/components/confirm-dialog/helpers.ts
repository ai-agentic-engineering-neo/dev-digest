import { ApiError } from "@/lib/api";

/**
 * The message a failed delete shows in the dialog: the API's own words when it
 * gave any (a 404 after another tab deleted the row, a 409 from a constraint),
 * the caller's fallback otherwise.
 */
export function confirmErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError && error.message ? error.message : fallback;
}
