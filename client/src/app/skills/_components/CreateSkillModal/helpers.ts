import type { SkillFormValues } from "../helpers";
import { SKILL_BODY_MAX } from "../constants";
import { IMPORT_DESCRIPTION_MAX, IMPORT_FILE_EXTENSIONS, IMPORT_NAME_MAX } from "./constants";

/*
 * Pure helpers for importing a skill file in the browser. They mirror the
 * server's import helpers (server/src/modules/skills/helpers.ts → toSkillSlug,
 * draftFromMarkdown) so a file and a URL import fill the form the same way.
 */

/** Kebab-case slug for the `SkillName` contract (a–z, 0–9, single dashes, ≤ 64). */
export function toSkillSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, IMPORT_NAME_MAX)
    .replace(/-+$/g, "");
}

/** Body as stored: BOM dropped, CRLF → LF, trailing whitespace trimmed. */
export function normalizeImportedBody(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trimEnd();
}

/** Form values from a Markdown file: name = first `# heading` (else the file name). */
export function formFromMarkdown(body: string, fallbackName: string): SkillFormValues {
  const lines = body.split("\n");
  const heading = lines.find((l) => /^#{1,6}\s+\S/.test(l))?.replace(/^#{1,6}\s+/, "") ?? "";
  const paragraph = lines
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^(#|```|~~~|[-*+>|]|\d+\.)/.test(l));
  return {
    name: toSkillSlug(heading) || toSkillSlug(fallbackName),
    description: (paragraph ?? "").slice(0, IMPORT_DESCRIPTION_MAX),
    type: "custom",
    body,
  };
}

export type FileImportError = "wrongType" | "tooLong" | "empty" | "readFailed";

export type FileImportResult = { ok: true; form: SkillFormValues } | { ok: false; error: FileImportError };

/** UTF-8 text of a file via FileReader (works in every browser and in jsdom, unlike Blob.text). */
function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

/** Read a picked / dropped file into form values, or say why it cannot be imported. */
export async function readSkillFile(file: File): Promise<FileImportResult> {
  if (!IMPORT_FILE_EXTENSIONS.test(file.name)) return { ok: false, error: "wrongType" };
  // A cheap size guard before reading: 4 bytes per char is the UTF-8 worst case.
  if (file.size > SKILL_BODY_MAX * 4) return { ok: false, error: "tooLong" };
  let text: string;
  try {
    text = await readAsText(file);
  } catch {
    return { ok: false, error: "readFailed" };
  }
  const body = normalizeImportedBody(text);
  if (body.trim().length === 0) return { ok: false, error: "empty" };
  if (body.length > SKILL_BODY_MAX) return { ok: false, error: "tooLong" };
  return { ok: true, form: formFromMarkdown(body, file.name.replace(IMPORT_FILE_EXTENSIONS, "")) };
}
