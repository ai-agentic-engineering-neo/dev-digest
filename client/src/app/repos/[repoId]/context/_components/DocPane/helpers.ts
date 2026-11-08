/* helpers.ts — pure message selection for DocPane errors (no React). */
import type { DevdigestDocErrorDetails } from "@/lib/types";

export interface MessageRef {
  /** Key inside the `context` namespace. */
  key: string;
  values?: Record<string, string | number>;
}

/** Save failure → `errors.tooLarge` for too_large / 413, else `errors.saveFailed`. */
export function saveErrorText(details: DevdigestDocErrorDetails | null, message: string): MessageRef {
  if (details?.reason === "too_large") return { key: "errors.tooLarge" };
  return { key: "errors.saveFailed", values: { message } };
}

/** Copy failure → a specific reason when known, else the generic "not saved" text. */
export function copyErrorText(details: DevdigestDocErrorDetails | null, message: string): MessageRef {
  if (details?.reason === "limit_reached") {
    return { key: "errors.limitReached", values: { limit: details.limit ?? 0 } };
  }
  if (details?.reason === "invalid_name" && details.rule) {
    return { key: `errors.invalidName.${details.rule}` };
  }
  return { key: "errors.saveFailed", values: { message } };
}
