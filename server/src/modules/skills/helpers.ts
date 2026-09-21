import type { Skill, SkillStats, SkillVersion } from '@devdigest/shared';
import type {
  SkillRecord,
  SkillUsageCounts,
  SkillVersionRecord,
  UpdateSkill,
} from './types.js';
import { toPercent } from '../_shared/percent.js';

/**
 * Pure helpers for the skills module — record ⇄ DTO mapping, the
 * body-version-bump rule and the stats rate maths. No I/O.
 */

/** Map a persisted skill to the public `Skill` DTO (camelCase → snake_case). */
export function toSkillDto(row: SkillRecord): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    injection_detected: row.injectionDetected,
    injection_matches: row.injectionMatches,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
    restored_from: row.restoredFrom,
  };
}

/**
 * True when a patch actually changes the skill body relative to the existing
 * row. Only a body change bumps `version` and snapshots `skill_versions`;
 * name/description/type/enabled edits never do.
 */
export function isBodyChange(existing: Pick<SkillRecord, 'body'>, patch: UpdateSkill): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

export { toPercent };

/** Derive the public rate fields from raw counts. */
export function toRates(c: SkillUsageCounts): {
  used_by: number;
  pull_rate: number | null;
  accept_rate: number | null;
} {
  return {
    used_by: c.usedBy,
    pull_rate: toPercent(c.pulledRuns, c.eligibleRuns),
    accept_rate: toPercent(c.accepted, c.decided),
  };
}

/** Counts for a skill nothing has touched yet. */
export const EMPTY_USAGE: SkillUsageCounts = {
  usedBy: 0,
  agentsUsing: [],
  pulledRuns: 0,
  eligibleRuns: 0,
  accepted: 0,
  decided: 0,
  findings30d: 0,
  findingsByCategory: [],
};

/** Map raw usage counts to the public `SkillStats` DTO. */
export function toSkillStatsDto(c: SkillUsageCounts): SkillStats {
  return {
    ...toRates(c),
    findings_30d: c.findings30d,
    agents_using: c.agentsUsing,
    findings_by_category: c.findingsByCategory,
  };
}

// ---- markdown import (mirror of client `extract.ts` front-matter rules) -----
// Keep in sync with client/src/app/skills/_components/AddSkillModal/_components/
// FromFileTab/extract.ts - both are covered by the same cases in the tests.

const FRONT_MATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const MAX_NAME_LENGTH = 64;

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return v.slice(1, -1);
  }
  return v;
}

/** Minimal `key: value` parse of a front-matter block (no YAML library). */
function parseFrontMatterBlock(block: string): { name: string; description: string } {
  const out = { name: '', description: '' };
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(name|description)\s*:\s*(.*)$/.exec(lines[i] ?? '');
    if (!m) continue;
    const key = m[1] as 'name' | 'description';
    let value = (m[2] ?? '').trim();
    // Block scalar (`>` folded / `|` literal): gather the indented continuation lines.
    if (/^[>|][+-]?$/.test(value)) {
      const folded = value.startsWith('>');
      const parts: string[] = [];
      for (let next = lines[i + 1]; next !== undefined && /^\s+\S/.test(next); next = lines[i + 1]) {
        parts.push(next.trim());
        i++;
      }
      value = parts.join(folded ? ' ' : '\n');
    }
    out[key] = unquote(value);
  }
  return out;
}

/** kebab-case slug: lowercase, non-alphanumerics collapsed to `-`, capped in length. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/g, '');
}

/** Kebab-case name from the first level-1 `# heading` (outside code fences), or ''. */
function headingName(body: string): string {
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return slugify(m[1] ?? '');
  }
  return '';
}

export interface ParsedSkillMarkdown {
  /** `name:` from YAML front-matter, or ''. */
  name: string;
  /** Kebab-case name from the first `# heading`, or ''. */
  headingName: string;
  /** `description:` from YAML front-matter, or ''. */
  description: string;
  /** Skill text with any front-matter block stripped. */
  body: string;
}

/** Split a markdown skill file into front-matter metadata + body. */
export function parseSkillMarkdown(text: string): ParsedSkillMarkdown {
  const m = FRONT_MATTER.exec(text);
  const fm = m ? parseFrontMatterBlock(m[1] ?? '') : { name: '', description: '' };
  const body = m ? text.slice(m[0].length).replace(/^(?:\r?\n)+/, '') : text;
  return { ...fm, headingName: headingName(body), body };
}

/** Last meaningful URL path segment as a slug (`.../foo/SKILL.md` -> `foo`), or ''. */
function nameFromUrlPath(url: string): string {
  let segments: string[];
  try {
    segments = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return '';
  }
  const last = segments[segments.length - 1] ?? '';
  const stem = last.replace(/\.[^.]+$/, '');
  const generic = ['skill', 'readme'].includes(stem.toLowerCase());
  return slugify(generic && segments.length > 1 ? (segments[segments.length - 2] ?? '') : stem);
}

/** Skill name for an imported file: request -> front-matter -> first heading -> URL segment. */
export function deriveImportName(
  requested: string | undefined,
  parsed: ParsedSkillMarkdown,
  url: string,
): string {
  return (
    requested?.trim() ||
    parsed.name.trim() ||
    parsed.headingName ||
    nameFromUrlPath(url) ||
    'imported-skill'
  );
}

export type ImportUrlCheck = { ok: true; url: string } | { ok: false; message: string };

/**
 * Validate + normalise a user-supplied import URL: https only, no credentials, and
 * `github.com/<o>/<r>/blob|raw/<ref>/<path>` rewritten to the raw content host.
 * (Host/IP safety is the fetcher adapter's job - it sees the resolved address.)
 */
export function normalizeImportUrl(input: string): ImportUrlCheck {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, message: 'Not a valid URL' };
  }
  if (url.protocol !== 'https:') return { ok: false, message: 'URL must use https' };
  if (url.username || url.password) {
    return { ok: false, message: 'URL must not contain credentials' };
  }
  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(url.pathname);
    if (m) {
      return { ok: true, url: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` };
    }
  }
  return { ok: true, url: url.toString() };
}
