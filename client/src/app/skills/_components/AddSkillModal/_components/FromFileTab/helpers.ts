import type { SkillType } from "@devdigest/shared";
import type { CreateSkillInput } from "@/lib/hooks/skills";
import { slugify, type ExtractedSkill } from "./extract";

/** Body lines / characters shown in the core-file preview. */
export const PREVIEW_MAX_LINES = 12;
export const PREVIEW_MAX_CHARS = 900;

/** Typed name > front-matter name > first heading > file name (without extension). */
export function resolveName(typed: string, extracted: ExtractedSkill | null): string {
  if (typed.trim()) return typed.trim();
  if (!extracted) return "";
  const fromFile = extracted.sourceFile.slice(extracted.sourceFile.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  return extracted.name || extracted.headingName || slugify(fromFile);
}

/** Head of the body for the preview, plus how many lines were cut. */
export function excerptBody(body: string): { text: string; hiddenLines: number } {
  const lines = body.split(/\r?\n/);
  let text = lines.slice(0, PREVIEW_MAX_LINES).join("\n");
  if (text.length > PREVIEW_MAX_CHARS) text = text.slice(0, PREVIEW_MAX_CHARS);
  const shown = text.split("\n").length;
  return { text, hiddenLines: Math.max(0, lines.length - shown) };
}

/** `POST /skills` payload for an imported file (`source: 'extracted'`). */
export function buildImportPayload(name: string, type: SkillType, extracted: ExtractedSkill): CreateSkillInput {
  return {
    name,
    ...(extracted.description ? { description: extracted.description } : {}),
    type,
    body: extracted.body,
    source: "extracted",
  };
}
