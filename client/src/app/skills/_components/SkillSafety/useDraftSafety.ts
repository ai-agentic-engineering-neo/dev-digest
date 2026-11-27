"use client";

import type { SkillSafety } from "@devdigest/shared";
import { useSkillScan } from "@/lib/hooks/skills";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/** Typing pause before a draft body is scanned. */
export const SCAN_DEBOUNCE_MS = 500;

export interface DraftSafety {
  /** Scan of the CURRENT text; undefined while checking, failed or empty. */
  safety: SkillSafety | undefined;
  /** The text changed and its scan is not back yet: Save waits. */
  checking: boolean;
  /** The scan request failed: Save is allowed (the server scans on save). */
  failed: boolean;
}

/**
 * Safety of a body being edited. The saved body uses the saved scan; any other
 * text is scanned after a 500 ms pause (POST /skills/scan), and only a scan of
 * exactly the current text counts — so Save never trusts a stale result.
 */
export function useDraftSafety(
  body: string,
  saved?: { body: string; safety?: SkillSafety },
): DraftSafety {
  const debounced = useDebouncedValue(body, SCAN_DEBOUNCE_MS);
  const isSaved = saved !== undefined && body === saved.body;
  const scan = useSkillScan(debounced, !isSaved);

  if (isSaved) return { safety: saved.safety, checking: false, failed: false };
  if (body.trim() === "") return { safety: undefined, checking: false, failed: false };
  const settled = debounced === body;
  if (settled && scan.isError) return { safety: undefined, checking: false, failed: true };
  if (settled && scan.data) return { safety: scan.data, checking: false, failed: false };
  return { safety: undefined, checking: true, failed: false };
}
