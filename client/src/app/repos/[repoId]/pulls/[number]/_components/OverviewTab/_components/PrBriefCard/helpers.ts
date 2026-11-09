import { ApiError } from "@/lib/api";
import type { BriefErrorCode, BriefFailureReason, BriefTruncation } from "@/lib/types";

export type GenerateErrorView =
  | { kind: "not_configured"; provider: string }
  | { kind: "too_large"; tokens: number; limit: number }
  | { kind: "failed"; reason: BriefFailureReason }
  | { kind: "no_files" }
  | { kind: "unknown"; message: string };

const FAILURE_REASONS: readonly BriefFailureReason[] = ["provider_error", "timeout", "invalid_reply"];

/** Keyed by BriefErrorCode so adding a code to the type without listing it here fails to compile. */
const BRIEF_ERROR_CODES: Record<BriefErrorCode, true> = {
  brief_no_changed_files: true,
  brief_too_large: true,
  brief_model_not_configured: true,
  brief_generation_failed: true,
};

function isBriefErrorCode(code: unknown): code is BriefErrorCode {
  return typeof code === "string" && Object.hasOwn(BRIEF_ERROR_CODES, code);
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/** Maps a failed POST /brief to a view model; null when there is no error. */
export function generateErrorView(err: unknown): GenerateErrorView | null {
  if (err == null) return null;
  if (!(err instanceof ApiError)) {
    return { kind: "unknown", message: err instanceof Error ? err.message : String(err) };
  }
  if (!isBriefErrorCode(err.code)) return { kind: "unknown", message: err.message };
  const code: BriefErrorCode = err.code;
  const details = asRecord(err.details);
  switch (code) {
    case "brief_model_not_configured":
      return { kind: "not_configured", provider: typeof details.provider === "string" ? details.provider : "" };
    case "brief_too_large":
      return {
        kind: "too_large",
        tokens: typeof details.tokens === "number" ? details.tokens : 0,
        limit: typeof details.limit === "number" ? details.limit : 0,
      };
    case "brief_no_changed_files":
      return { kind: "no_files" };
    case "brief_generation_failed": {
      const reason = FAILURE_REASONS.find((r) => r === details.reason);
      return reason ? { kind: "failed", reason } : { kind: "unknown", message: err.message };
    }
    default: {
      const unhandled: never = code;
      return { kind: "unknown", message: String(unhandled) };
    }
  }
}

export type TruncationPart = { key: "specDocs" | "callers" | "boilerplate"; count: number };

/** The non-zero parts of a truncation record, in a fixed order. */
export function truncationParts(truncated: BriefTruncation): TruncationPart[] {
  const parts: TruncationPart[] = [
    { key: "specDocs", count: truncated.spec_docs },
    { key: "callers", count: truncated.callers },
    { key: "boilerplate", count: truncated.boilerplate_hunk_files },
  ];
  return parts.filter((p) => p.count > 0);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
