import { unzipSync } from 'fflate';
import {
  SKILL_BODY_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  SkillType,
  type Skill,
  type SkillStats,
  type SkillStatsSummary,
  type SkillImportPreview,
} from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';
import type { SkillFindingUsage, SkillLinkUsage, SkillRunUsage } from './repository.js';
import { AppError, ValidationError } from '../../platform/errors.js';
import {
  CORE_FILE_NAME,
  DEFAULT_IMPORT_TYPE,
  MAX_ARCHIVE_ENTRIES,
  MAX_ENTRY_BYTES,
  MAX_LINKS_BEFORE_WARNING,
  MAX_UPLOAD_BYTES,
  SUSPICIOUS_PATTERNS,
} from './constants.js';

/** Map a persisted skill row to the API `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
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
  };
}

interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * Minimal frontmatter reader: a leading `---` block of `key: value` lines (single
 * line, optionally quoted; indented lines continue the previous value). Not a YAML
 * parser on purpose — an imported file is untrusted, so we read only flat strings.
 */
export function parseFrontmatter(md: string): Frontmatter {
  const text = md.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  let key: string | null = null;
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (kv) {
      key = kv[1]!.toLowerCase();
      data[key] = stripQuotes(kv[2]!.trim());
    } else if (key && /^\s+\S/.test(line)) {
      data[key] = `${data[key] ?? ''} ${line.trim()}`.trim();
    }
  }
  // Folded/literal block markers carry no text of their own.
  for (const k of Object.keys(data)) if (/^[>|][+-]?$/.test(data[k]!)) data[k] = '';
  return { data, body: text.slice(m[0].length) };
}

function stripQuotes(v: string): string {
  return v.replace(/^(["'])(.*)\1$/, '$2');
}

/** Turn arbitrary text into a name that satisfies `SkillInput.name`. */
export function sanitizeSkillName(raw: string): string {
  const cleaned = raw
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[^A-Za-z0-9 _.-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .trim();
  return cleaned.slice(0, SKILL_NAME_MAX);
}

function firstHeading(body: string): string | undefined {
  return body.match(/^#{1,3}\s+(.+?)\s*#*\s*$/m)?.[1];
}

function firstParagraph(body: string): string | undefined {
  for (const block of body.split(/\n{2,}/)) {
    const line = block.trim();
    if (!line || /^(#|```|---|[-*]\s|\d+\.\s|>)/.test(line)) continue;
    return line.replace(/\s+/g, ' ');
  }
  return undefined;
}

/** Trust warnings for text that is about to become part of an agent prompt. */
export function scanForWarnings(body: string): string[] {
  const warnings: string[] = [];
  for (const { re, warning } of SUSPICIOUS_PATTERNS) if (re.test(body)) warnings.push(warning);
  const links = body.match(/https?:\/\/[^\s)>\]"']+/g) ?? [];
  if (links.length > MAX_LINKS_BEFORE_WARNING) {
    warnings.push(`Contains ${links.length} external links; check that none point somewhere you do not trust.`);
  }
  return warnings;
}

/** Decode upload bytes as UTF-8 text; refuse binary content. */
function decodeText(bytes: Uint8Array, what: string): string {
  if (bytes.includes(0)) throw new ValidationError(`${what} is not a text file`);
  return new TextDecoder('utf-8').decode(bytes);
}

function isSafeEntryName(name: string): boolean {
  return !name.startsWith('/') && !name.split('/').includes('..') && !name.includes('\\');
}

/**
 * Choose the archive entry holding the skill core: `SKILL.md` (shallowest wins),
 * else the shallowest other `.md` that is not a README, else a README.
 */
export function pickCoreEntry(names: string[]): string | undefined {
  const md = names.filter((n) => !n.endsWith('/') && /\.md$/i.test(n) && isSafeEntryName(n));
  const depth = (n: string) => n.split('/').length;
  const byDepth = (a: string, b: string) => depth(a) - depth(b) || a.localeCompare(b);
  const base = (n: string) => n.split('/').pop()!.toLowerCase();
  return (
    md.filter((n) => base(n) === CORE_FILE_NAME).sort(byDepth)[0] ??
    md.filter((n) => base(n) !== 'readme.md').sort(byDepth)[0] ??
    md.sort(byDepth)[0]
  );
}

interface ExtractedFile {
  text: string;
  sourceFile: string;
  ignored: string[];
}

/**
 * Read the skill core out of an archive WITHOUT extracting it: entries are listed
 * from the central directory, only the chosen markdown entry is inflated (with a
 * size cap), and every other entry is reported as ignored — never read, never
 * written to disk, never run.
 */
export function extractFromArchive(bytes: Uint8Array): ExtractedFile {
  const names: string[] = [];
  const sizes = new Map<string, number>();
  unzipSync(bytes, {
    filter: (f) => {
      names.push(f.name);
      sizes.set(f.name, f.originalSize);
      if (names.length > MAX_ARCHIVE_ENTRIES) throw new ValidationError('Archive has too many entries');
      return false; // list only — nothing is inflated in this pass
    },
  });
  const core = pickCoreEntry(names);
  if (!core) throw new ValidationError('No markdown skill file found in the archive');
  if ((sizes.get(core) ?? 0) > MAX_ENTRY_BYTES) {
    throw new AppError('file_too_large', 'The skill file inside the archive is too large', 413);
  }
  const files = unzipSync(bytes, { filter: (f) => f.name === core });
  const data = files[core];
  if (!data) throw new ValidationError('Could not read the skill file from the archive');
  return {
    text: decodeText(data, core),
    sourceFile: core,
    ignored: names.filter((n) => n !== core && !n.endsWith('/')),
  };
}

/** Bytes → the skill core text, from a `.md` file or a `.zip` archive. */
export function extractSkillText(filename: string, bytes: Uint8Array): ExtractedFile {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError('file_too_large', 'File is too large (max 512 KB)', 413);
  }
  const lower = filename.toLowerCase();
  const isZip = lower.endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  if (isZip) {
    try {
      return extractFromArchive(bytes);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ValidationError('Could not read the archive');
    }
  }
  if (/\.(md|markdown)$/i.test(lower)) {
    return { text: decodeText(bytes, filename), sourceFile: filename, ignored: [] };
  }
  throw new ValidationError('Only .md and .zip files can be imported');
}

/** Build the preview the user reviews before anything is stored. */
export function buildImportPreview(filename: string, bytes: Uint8Array): SkillImportPreview {
  const { text, sourceFile, ignored } = extractSkillText(filename, bytes);
  const { data, body: rawBody } = parseFrontmatter(text);
  const fullBody = rawBody.trim();
  if (!fullBody) throw new ValidationError('The skill file is empty');

  const nameGuess =
    data.name || firstHeading(fullBody) || sourceFile.split('/').pop() || filename;
  const name = sanitizeSkillName(nameGuess) || 'imported-skill';
  const description = (data.description || firstParagraph(fullBody) || `Imported skill ${name}`)
    .slice(0, SKILL_DESCRIPTION_MAX)
    .trim();
  const typeParsed = SkillType.safeParse((data.type ?? '').toLowerCase());
  const truncated = fullBody.length > SKILL_BODY_MAX;
  const body = truncated ? fullBody.slice(0, SKILL_BODY_MAX) : fullBody;

  const warnings = scanForWarnings(body);
  if (ignored.length > 0) {
    warnings.push(
      `${ignored.length} non-skill file${ignored.length === 1 ? '' : 's'} in the archive ` +
        'were ignored — they are not read or executed.',
    );
  }
  return {
    name,
    description,
    type: typeParsed.success ? typeParsed.data : DEFAULT_IMPORT_TYPE,
    body,
    source_file: sourceFile,
    ignored_entries: ignored,
    warnings,
    truncated,
  };
}

export interface SkillStatsInput {
  skills: Array<{ id: string; name: string }>;
  links: SkillLinkUsage[];
  /** Runs already restricted to status `done` inside the window. */
  runs: SkillRunUsage[];
  findings: SkillFindingUsage[];
  windowDays: number;
}

/** True when the rendered skills block has the skill's `### <name>` header at a line start. */
export function skillWasPulled(skillsText: string | null, skillName: string): boolean {
  if (!skillsText) return false;
  // Compare whole lines, no regex: skill names may contain regex metacharacters,
  // and a name that prefixes another (`api` / `api-gate`) must not match it.
  const header = `### ${skillName}`;
  return skillsText.split(/\r?\n/).some((line) => line.trimEnd() === header);
}

/** accepted / dismissed / undecided; when both timestamps are set the latest wins. */
export function findingDecision(f: Pick<SkillFindingUsage, 'acceptedAt' | 'dismissedAt'>): 'accepted' | 'dismissed' | null {
  if (f.acceptedAt && (!f.dismissedAt || f.acceptedAt >= f.dismissedAt)) return 'accepted';
  if (f.dismissedAt) return 'dismissed';
  return null;
}

/** Project the full stats to the list-card footer shape. */
export function toStatsSummary(s: SkillStats): SkillStatsSummary {
  return {
    skill_id: s.skill_id,
    agents_count: s.agents_count,
    pull_rate: s.pull_rate,
    accept_rate: s.accept_rate,
  };
}

/** Pure stats maths (see specs/02-skills-for-review-agents.md, "Stats definitions"). One entry per input skill. */
export function computeSkillStats(input: SkillStatsInput): SkillStats[] {
  const runsByAgent = new Map<string, SkillRunUsage[]>();
  for (const r of input.runs) {
    const list = runsByAgent.get(r.agentId) ?? [];
    list.push(r);
    runsByAgent.set(r.agentId, list);
  }
  const findingsByRun = new Map<string, SkillFindingUsage[]>();
  for (const f of input.findings) {
    const list = findingsByRun.get(f.runId) ?? [];
    list.push(f);
    findingsByRun.set(f.runId, list);
  }

  return input.skills.map((skill) => {
    const links = input.links.filter((l) => l.skillId === skill.id);
    const runs = links.flatMap((l) => runsByAgent.get(l.agentId) ?? []);
    const pulled = runs.filter((r) => skillWasPulled(r.skillsText, skill.name));
    const findings = pulled.flatMap((r) => findingsByRun.get(r.runId) ?? []);

    let accepted = 0;
    let dismissed = 0;
    const categories = new Map<string, number>();
    for (const f of findings) {
      const decision = findingDecision(f);
      if (decision === 'accepted') accepted++;
      else if (decision === 'dismissed') dismissed++;
      categories.set(f.category, (categories.get(f.category) ?? 0) + 1);
    }
    const decided = accepted + dismissed;

    return {
      skill_id: skill.id,
      agents_count: links.length,
      pull_rate: runs.length === 0 ? null : pulled.length / runs.length,
      accept_rate: decided === 0 ? null : accepted / decided,
      window_days: input.windowDays,
      runs_total: runs.length,
      runs_pulled: pulled.length,
      findings_total: findings.length,
      findings_accepted: accepted,
      findings_dismissed: dismissed,
      agents: links
        .map((l) => ({ id: l.agentId, name: l.agentName, enabled: l.linkEnabled }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      by_category: [...categories.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    };
  });
}
