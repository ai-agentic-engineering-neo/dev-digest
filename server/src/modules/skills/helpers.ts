import type { Skill, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import {
  DEFAULT_SKILL_TYPE,
  FALLBACK_SKILL_NAME,
  MAX_SKILL_DESCRIPTION_CHARS,
  TYPE_KEYWORDS,
} from './constants.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, the version-bump
 * rule, and the importer's markdown parsing. No I/O, so every branch here is
 * unit-testable without a database.
 */

/**
 * Map a persisted skill row to the public `Skill` DTO.
 *
 * `agentCount` is optional because callers that already hold the link (the
 * review pipeline resolving an agent's own skills) have no use for it and
 * should not pay for the aggregate query to produce it.
 */
export function toSkillDto(row: SkillRow, agentCount?: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as Skill['source'],
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agent_count: agentCount ?? null,
  };
}

/** Map a `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch changes the skill's BODY — the only field that bumps the
 * version and writes an immutable snapshot.
 *
 * Deliberately narrower than the agents' `isConfigChange`: renaming a skill or
 * fixing a typo in its description does not change what the model is told, so
 * it should not spawn a version whose body is byte-identical to the previous
 * one. Versions exist so you can see how the INSTRUCTIONS evolved.
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

// ---- Import parsing ------------------------------------------------------

/** The skill "core" recovered from a markdown document. */
export interface ParsedSkillDocument {
  name: string;
  description: string;
  type: SkillType;
  /** The document minus its frontmatter block. */
  body: string;
}

/**
 * Recover a skill's core from a markdown document.
 *
 * Handles the `SKILL.md` convention (YAML frontmatter with `name`/`description`
 * /`type`) and plain markdown alike, because "import a skill" has to work on a
 * file someone wrote by hand as well as on one exported from a skill registry.
 * Anything missing is derived from the prose: the name from the first heading,
 * the description from the first paragraph, the type from a keyword scan.
 */
export function parseSkillDocument(text: string): ParsedSkillDocument {
  const { frontmatter, body } = splitFrontmatter(text);

  const name = firstNonEmpty(frontmatter.name, headingName(body)) ?? FALLBACK_SKILL_NAME;
  const description = (
    firstNonEmpty(frontmatter.description, firstParagraph(body)) ?? ''
  ).slice(0, MAX_SKILL_DESCRIPTION_CHARS);

  const declared = SkillTypeSchema.safeParse(frontmatter.type?.trim().toLowerCase());
  const type = declared.success ? declared.data : inferSkillType(`${name} ${description} ${body}`);

  return { name: name.trim(), description: description.trim(), type, body: body.trim() };
}

/**
 * Split a leading YAML frontmatter block off a markdown document.
 *
 * This parses a deliberate SUBSET of YAML — `key: value` plus `>`/`|` folded and
 * literal blocks, which is what skill frontmatter actually uses. Pulling in a
 * real YAML parser to read two fields out of an untrusted file would add an
 * attack surface (anchors, aliases, type tags) far larger than the problem.
 * Unknown keys are ignored; a malformed block degrades to "no frontmatter"
 * rather than throwing, since the body is still usable.
 */
export function splitFrontmatter(text: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { frontmatter: {}, body: normalized };

  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: normalized };

  const raw = normalized.slice(4, end);
  const body = normalized.slice(normalized.indexOf('\n', end + 1) + 1);
  return { frontmatter: parseSimpleYaml(raw), body };
}

function parseSimpleYaml(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    // Only top-level keys; indented lines belong to a block we consume below.
    const match = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;

    const [, key, rest] = match as unknown as [string, string, string];
    if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
      const block: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1]!.startsWith('  ') || !lines[i + 1]!.trim())) {
        block.push(lines[++i]!.trim());
      }
      // Folded (`>`) joins with spaces; literal (`|`) keeps the line breaks.
      out[key] = rest.startsWith('>')
        ? block.join(' ').replace(/\s+/g, ' ').trim()
        : block.join('\n').trim();
      continue;
    }
    out[key] = stripQuotes(rest.trim());
  }
  return out;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && /^["'].*["']$/.test(value) && value[0] === value.at(-1)) {
    return value.slice(1, -1);
  }
  return value;
}

/** The first markdown heading, used as the name when frontmatter has none. */
export function headingName(body: string): string | undefined {
  const match = body.match(/^\s*#{1,6}\s+(.+?)\s*$/m);
  return match?.[1];
}

/** The first prose paragraph, skipping headings/code fences/list bullets. */
function firstParagraph(body: string): string | undefined {
  for (const block of body.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('---')) continue;
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) continue;
    return trimmed.replace(/\s+/g, ' ');
  }
  return undefined;
}

/** Keyword scan over the document, for imports that declare no type. */
export function inferSkillType(text: string): SkillType {
  const haystack = text.toLowerCase();
  for (const [type, keywords] of TYPE_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return type;
  }
  return DEFAULT_SKILL_TYPE;
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => v !== undefined && v.trim().length > 0);
}
