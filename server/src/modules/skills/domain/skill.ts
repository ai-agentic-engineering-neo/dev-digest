/**
 * Pure skill rules: naming, versioning, trust gate and the prompt block.
 * server/specs/03-skills.md Rules §1, §3, §5, §6 and Decision Q3.
 */
import { SKILL_NAME_MAX, SKILL_NAME_RE, type CreatableSkillSource } from '@devdigest/shared';
import { FALLBACK_SKILL_NAME } from './constants.js';

/** True when `name` is a valid skill slug (kebab-case, 1..64). */
export function isValidSkillName(name: string): boolean {
  return name.length >= 1 && name.length <= SKILL_NAME_MAX && SKILL_NAME_RE.test(name);
}

/**
 * Turn any label (file name, folder, frontmatter `name`) into a skill slug:
 * lowercase ASCII letters/digits separated by single dashes, ≤ 64 chars.
 * Falls back to `imported-skill` when nothing usable is left.
 */
export function slugifySkillName(raw: string): string {
  const slug = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.(md|markdown|txt|zip)$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : FALLBACK_SKILL_NAME;
}

/** The model-facing texts of a skill — the part that is versioned. */
export interface SkillText {
  body: string;
  description: string;
}

/**
 * The version message for a patch, or null when the patch does not change the
 * model-facing text (body / description). Re-sending the same text is not a
 * change. `name`, `type`, `enabled` never version (they update in place).
 */
export function editMessage(current: SkillText, patch: Partial<SkillText>): string | null {
  const body = patch.body !== undefined && patch.body !== current.body;
  const description = patch.description !== undefined && patch.description !== current.description;
  if (body && description) return 'Edited body and description';
  if (body) return 'Edited body';
  if (description) return 'Edited description';
  return null;
}

/** Message of version 1: `Created`, or `Imported from <ref>` for a foreign skill. */
export function createdMessage(source: CreatableSkillSource, sourceRef: string | null | undefined): string {
  if (source === 'manual' || !sourceRef) return 'Created';
  return `Imported from ${sourceRef}`;
}

/** Message of v1 of a skill merged from a repo's accepted conventions. */
export function extractedMessage(repoFullName: string): string {
  return `Extracted from conventions of ${repoFullName}`;
}

/** Provenance of an extracted skill (`skills.source_ref`). */
export function extractedSourceRef(repoFullName: string): string {
  return `conventions:${repoFullName}`;
}

/** Message of a restore: the texts of vK written as a new version. */
export function restoredMessage(version: number): string {
  return `Restored from v${version}`;
}

/**
 * Trust gate (Rules §6): a skill that did not come from the user's own hand is
 * foreign instructions, so it is ALWAYS stored disabled — whatever the client
 * sent. Only a later explicit toggle enables it.
 */
export function initialEnabled(source: CreatableSkillSource, requested: boolean | undefined): boolean {
  if (source !== 'manual') return false;
  return requested ?? true;
}

/**
 * The block one skill contributes to `## Skills / rules` (Rules §5):
 *
 *   ### <name>
 *   _Applies when:_ <description>     ← omitted when the description is empty
 *
 *   <body>
 */
export function renderSkillBlock(skill: { name: string; description: string; body: string }): string {
  const description = skill.description.trim();
  const head = description ? `### ${skill.name}\n_Applies when:_ ${description}` : `### ${skill.name}`;
  return `${head}\n\n${skill.body.trim()}`;
}
