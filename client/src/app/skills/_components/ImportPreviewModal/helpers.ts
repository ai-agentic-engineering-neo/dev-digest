import { KNOWN_IGNORE_REASONS } from "./constants";

/** Message key of an ignored-file reason; unknown reasons use the generic one. */
export function ignoreReasonKey(reason: string): string {
  return (KNOWN_IGNORE_REASONS as readonly string[]).includes(reason)
    ? `importPreview.reason.${reason}`
    : "importPreview.reason.other";
}
