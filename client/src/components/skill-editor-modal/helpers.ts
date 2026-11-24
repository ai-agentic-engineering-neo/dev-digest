import type { SkillCreate } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

export type FieldKey = "name" | "description" | "body";
export type FieldErrors = Partial<Record<FieldKey, true>>;

export type Draft = Pick<SkillCreate, "name" | "description" | "type" | "body">;

/** Required-field check; returns the keys that are blank. */
export function validateDraft(d: Draft): FieldErrors {
  const errors: FieldErrors = {};
  if (!d.name.trim()) errors.name = true;
  if (!d.description.trim()) errors.description = true;
  if (!d.body.trim()) errors.body = true;
  return errors;
}

/** Trim text fields; body is kept verbatim apart from surrounding whitespace. */
export function normalizeDraft(d: Draft): Draft {
  return { name: d.name.trim(), description: d.description.trim(), type: d.type, body: d.body.trim() };
}

/** Human-readable message for a failed save (server 422 details included). */
export function saveErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : String(e);
  const d = e.details;
  if (Array.isArray(d) && d.length > 0) {
    const parts = d
      .map((x) => (x && typeof x === "object" && "message" in x ? String((x as { message: unknown }).message) : ""))
      .filter(Boolean);
    if (parts.length) return `${e.message}: ${parts.join("; ")}`;
  }
  return e.message;
}
