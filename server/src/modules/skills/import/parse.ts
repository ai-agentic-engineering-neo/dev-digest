import type { SkillType } from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';

/**
 * Pure parsing for skill import (M2) — no I/O. Turns an uploaded SKILL.md (or a
 * loose .md) into the editable preview fields. The CORE of a skill is the
 * frontmatter `name` / `description` (+ optional `type`) and the markdown body;
 * everything else in an archive is ignored by design.
 */

export interface ParsedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  warnings: string[];
}

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Minimal YAML-subset reader for frontmatter: `key: value` lines, quoted
 * values, and `key: >` / `key: |` blocks of indented lines. Nested maps
 * (e.g. `metadata:`) are skipped. Enough for SKILL.md headers; never evaluates.
 */
export function parseFrontmatter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    let value = m[2]!.trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-' || value === '') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) {
        block.push(lines[i + 1]!.trim());
        i++;
      }
      // An empty value followed by indented `k: v` lines is a nested map — skip.
      if (value === '' && block.some((l) => /^[A-Za-z0-9_-]+:/.test(l))) continue;
      value = block.join(value.startsWith('|') ? '\n' : ' ');
    }
    out[key] = unquote(value);
  }
  return out;
}

function unquote(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Normalise any title / file name into a valid skill name (SkillName). */
export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/\.(md|zip)$/i, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+|[-._]+$/g, '')
    .slice(0, 80);
  return slug || 'imported-skill';
}

/** Best-effort type from explicit frontmatter, else keywords. */
export function inferType(explicit: string | undefined, name: string, description: string): SkillType {
  const parsed = SkillTypeSchema.safeParse(explicit?.toLowerCase());
  if (parsed.success) return parsed.data;
  const hay = `${name} ${description}`.toLowerCase();
  if (/secur|secret|inject|owasp|ssrf|xss|auth/.test(hay)) return 'security';
  if (/convention|style|naming|house rule/.test(hay)) return 'convention';
  if (/rubric|checklist|criteria/.test(hay)) return 'rubric';
  return 'custom';
}

// Phrasing that tries to override the agent rather than add review rules. Only
// a hint for the human reviewing the import — trust is THEIR decision.
const OVERRIDE_HINTS =
  /ignore (all |any )?(previous|prior|above) instructions|disregard .*instructions|you are now|approve (this|the) (pr|pull request)|do not (report|flag) /i;

export function parseSkillMarkdown(text: string, fallbackName: string): ParsedSkill {
  const warnings: string[] = [];
  const fm = FRONTMATTER.exec(text);
  const meta = fm ? parseFrontmatter(fm[1]!) : {};
  const body = (fm ? text.slice(fm[0].length) : text).trim();
  if (!fm) warnings.push('No frontmatter found — name and description were derived from the file.');

  const name = slugify(meta.name || fallbackName);
  let description = (meta.description ?? '').trim();
  if (!description) {
    const firstPara = body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/^#+\s*/, '').trim())
      .find((p) => p.length > 0);
    description = (firstPara ?? name).slice(0, 300);
    warnings.push('No description in frontmatter — using the first paragraph. Rewrite it as a directive.');
  }
  if (description.length > 500) description = `${description.slice(0, 497)}...`;
  if (!body) warnings.push('The skill body is empty.');
  if (OVERRIDE_HINTS.test(body)) {
    warnings.push('The body contains phrasing that tries to override the agent (e.g. "ignore previous instructions"). Review carefully.');
  }
  return { name, description, type: inferType(meta.type, name, description), body, warnings };
}

/**
 * Choose the SKILL.md inside an archive: at the root or exactly one folder
 * deep (`my-skill/SKILL.md`), shallowest first. Anything deeper is ignored.
 */
export function pickSkillEntry(entries: string[]): string | undefined {
  const candidates = entries.filter(isSkillEntryCandidate);
  candidates.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  return candidates[0];
}

export function isSkillEntryCandidate(name: string): boolean {
  const parts = name.split('/');
  return parts.length <= 2 && parts[parts.length - 1]!.toLowerCase() === 'skill.md';
}

/** Fallback skill name for an archive: its folder (`my-skill/SKILL.md`) or the zip name. */
export function fallbackNameFor(entry: string, fileName: string): string {
  const parts = entry.split('/');
  return parts.length === 2 ? parts[0]! : fileName.replace(/\.(zip|md)$/i, '');
}
