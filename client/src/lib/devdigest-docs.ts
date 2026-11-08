/* devdigest-docs.ts — pure helpers for the user-owned `.devdigest/specs/` docs (SPEC-03). */
import { ApiError } from "@/lib/api";
import type {
  DevdigestDocErrorDetails,
  DevdigestDocErrorReason,
  DevdigestNameRule,
} from "@/lib/types";

export const DEVDIGEST_ROOT = ".devdigest/specs/";
/** Mirrors server MAX_DEVDIGEST_DOC_BYTES (UTF-8 bytes, upload and save). */
export const MAX_DEVDIGEST_DOC_BYTES = 1_048_576;

const REASONS: readonly DevdigestDocErrorReason[] = [
  "invalid_name",
  "exists",
  "limit_reached",
  "too_large",
  "not_markdown",
  "not_text",
];

export function isDevdigestPath(path: string): boolean {
  return path.startsWith(DEVDIGEST_ROOT);
}

/** ".devdigest/specs/auth/a.md" → "auth/a.md"; other paths are returned unchanged. */
export function devdigestRelative(path: string): string {
  return isDevdigestPath(path) ? path.slice(DEVDIGEST_ROOT.length) : path;
}

/** Full path of `name` inside a devdigest-relative `folder` ('' = root). */
export function joinDevdigest(folder: string, name: string): string {
  return `${DEVDIGEST_ROOT}${folder ? `${folder}/` : ""}${name}`;
}

/** New folder names are checked on the client only (the server creates folders implicitly). */
export function checkFolderName(name: string): DevdigestNameRule | null {
  if (name === "") return "empty";
  if (name.includes("..")) return "dot_dot";
  if (name.includes("\\")) return "backslash";
  if (name.startsWith("/")) return "leading_slash";
  if (/[\r\n]/.test(name)) return "line_break";
  if (name.split("/").some((seg) => seg === "" || seg === ".")) return "empty_segment";
  return null;
}

function isReason(value: unknown): value is DevdigestDocErrorReason {
  return REASONS.some((r) => r === value);
}

/** ApiError → its details; status 413 → `too_large`; anything else → null. */
export function devdigestErrorOf(e: unknown): DevdigestDocErrorDetails | null {
  if (!(e instanceof ApiError)) return null;
  if (e.status === 413) return { reason: "too_large" };
  const d = e.details;
  if (typeof d !== "object" || d === null || !("reason" in d)) return null;
  if (!isReason(d.reason)) return null;
  return d as DevdigestDocErrorDetails;
}

export function precheckUpload(file: { name: string; size: number }): "not_markdown" | "too_large" | null {
  if (!file.name.toLowerCase().endsWith(".md")) return "not_markdown";
  if (file.size > MAX_DEVDIGEST_DOC_BYTES) return "too_large";
  return null;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Base64 of the file bytes (the `data:…;base64,` prefix is stripped). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
