import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Skills — pure domain rules. A skill is TEXT ONLY: a named, typed markdown body
 * that is appended to an agent's prompt. It never runs code, never calls tools.
 */

/** Sources whose bodies were authored inside this workspace (trusted rules). */
const TRUSTED_SOURCES: ReadonlySet<SkillSource> = new Set<SkillSource>(['manual', 'extracted']);

/** Imported / community skills are someone else's instructions → untrusted. */
export function isTrustedSkillSource(source: SkillSource): boolean {
  return TRUSTED_SOURCES.has(source);
}

/** Editable fields of a skill. */
export interface SkillContent {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/**
 * True when a patch changes the skill's content (anything but `enabled`) —
 * such a change bumps the version and snapshots `skill_versions`.
 */
export function isSkillContentChange(existing: SkillContent, patch: Partial<SkillContent>): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/** A skill resolved for one review run (enabled + linked, in agent order). */
export interface PromptSkill {
  name: string;
  body: string;
  trusted: boolean;
}

/**
 * Skill import preview (response of POST /skills/import/preview). A .md file or
 * .zip archive is parsed into this before anything is saved; executable/binary
 * archive entries are never run — only listed as `ignored`.
 * Kept module-local on purpose: `vendor/shared` is "Do not touch" (AGENTS.md).
 * The client mirrors this shape in client/src/lib/types.ts.
 */
export type SkillImportFileStatus = 'used' | 'ignored';

export interface SkillImportFile {
  path: string;
  size: number;
  status: SkillImportFileStatus;
  reason?: string | null;
}

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  files: SkillImportFile[];
  warnings: string[];
}

/** Skill names are identifiers shown in the prompt and the UI: kebab-case. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Best-effort kebab-case slug from a free-form name / filename. */
export function toSkillSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.(md|markdown|txt|zip)$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
