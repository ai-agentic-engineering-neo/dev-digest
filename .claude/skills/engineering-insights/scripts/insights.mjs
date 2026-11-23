#!/usr/bin/env node
// engineering-insights — mechanical part of the skill (routing, reading, append-only writes, lint).
// Judgment (what is an insight) lives in SKILL.md; this file only does what code does better.
// No dependencies. Imported by the hooks in ../hooks/, also usable as a CLI (see usage()).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_DIR = path.resolve(
  process.env.CLAUDE_PROJECT_DIR || path.join(HERE, '..', '..', '..', '..'),
);

export const MODULES = ['client', 'server', 'reviewer-core', 'e2e', 'root'];
export const SECTIONS = [
  'What Works',
  "What Doesn't Work",
  'Codebase Patterns',
  'Tool & Library Notes',
  'Recurring Errors & Fixes',
  'Session Notes',
  'Open Questions',
];
// Sections always injected in full even when a big file is filtered by relevance.
const PRIORITY_SECTIONS = ["What Doesn't Work", 'Recurring Errors & Fixes'];
const MAX_INJECT_CHARS = 8000;
const MAX_ENTRIES = 200;

const DATE = '\\d{4}-\\d{2}-\\d{2}';
const ENTRY_RE = new RegExp(`^- ${DATE} · .+ · .+→.+`);
const SESSION_NOTE_RE = new RegExp(`^- ${DATE} · .+ · .+`);

export const insightsFile = (module) =>
  path.join(PROJECT_DIR, module === 'root' ? '' : module, 'INSIGHTS.md');

export const isInsightsPath = (p) => /(^|[\\/])INSIGHTS[^\\/]*\.md$/.test(p || '');

// ---------- routing ----------

/** Map a file path (absolute or project-relative) to a module, or null when outside the project. */
export function routePath(p) {
  const abs = path.resolve(PROJECT_DIR, p);
  const rel = path.relative(PROJECT_DIR, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const top = rel.split(path.sep)[0];
  return MODULES.includes(top) && top !== 'root' ? top : 'root';
}

export function routePaths(paths) {
  return [...new Set(paths.map(routePath).filter(Boolean))];
}

const KEYWORDS = {
  client: [/\bclient\b/i, /клієнт/i, /\bnext(\.js)?\b/i, /\breact\b/i, /\bui\b/i, /\bfrontend\b/i, /фронт/i, /\bcomponent/i, /компонент/i, /сторінк/i],
  server: [/\bserver\b/i, /сервер/i, /\bfastify\b/i, /\bdrizzle\b/i, /\broutes?\b/i, /роут/i, /\bmigrat/i, /міграц/i, /\bdb\b/i, /\bpostgres/i, /\bpgvector\b/i, /\bjobs?\b/i, /\bapi\b/i, /бекенд/i, /\bbackend\b/i, /repo-intel/i],
  'reviewer-core': [/reviewer-core/i, /reviewer core/i, /движ(ок|к)/i, /\bagent prompt/i, /промпт/i, /\bgrounding\b/i, /review engine/i],
  e2e: [/\be2e\b/i, /\bplaywright\b/i, /end-to-end/i, /браузерн/i],
  root: [/\bscripts?\//i, /dev\.sh/i, /e2e\.sh/i, /\bci\b/i, /github actions/i, /\bworkflows?\b/i, /docker/i, /монорепо/i, /\bmonorepo\b/i, /vendor\/shared/i, /контракт/i],
};

/** Modules mentioned in a prompt (explicit names, paths, keywords). */
export function detectFromPrompt(prompt) {
  const text = prompt || '';
  const found = new Set();
  for (const [mod, patterns] of Object.entries(KEYWORDS)) {
    if (patterns.some((re) => re.test(text))) found.add(mod);
  }
  // Explicit file paths in the prompt win over keywords.
  for (const m of text.matchAll(/(?:^|[\s`'"(])((?:client|server|reviewer-core|e2e|scripts|docs)\/[\w./-]+)/g)) {
    const mod = routePath(m[1]);
    if (mod) found.add(mod);
  }
  return [...found];
}

/** Modules with uncommitted changes (git status). Empty on any git error. */
export function detectFromGit() {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd: PROJECT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    });
    const paths = out.split('\n').filter(Boolean).map((l) => l.slice(3).split(' -> ').pop());
    return routePaths(paths.filter((p) => !isInsightsPath(p)));
  } catch {
    return [];
  }
}

// ---------- parsing ----------

export function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n');
}

/** { heading, start, end } per `## ` section; end is exclusive (next heading or EOF). */
export function parseSections(lines) {
  const heads = [];
  lines.forEach((l, i) => { if (l.startsWith('## ')) heads.push({ heading: l.slice(3).trim(), start: i }); });
  return heads.map((h, k) => ({ ...h, end: k + 1 < heads.length ? heads[k + 1].start : lines.length }));
}

const isEntry = (l) => l.startsWith('- ');

export function entries(lines) {
  return parseSections(lines).flatMap((s) =>
    lines.slice(s.start + 1, s.end).filter(isEntry).map((text) => ({ section: s.heading, text })),
  );
}

// ---------- read / show ----------

/** Text to inject for a module; filtered by keywords when the file is large. */
export function show(module, keywords = []) {
  const file = insightsFile(module);
  if (!fs.existsSync(file)) return { module, file, empty: true, text: '' };
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const all = entries(lines);
  if (all.length === 0) return { module, file, empty: true, text: '' };
  if (raw.length <= MAX_INJECT_CHARS) {
    // Skip the file header (format rules are in the skill); keep only non-empty sections.
    const text = SECTIONS.map((sec) => {
      const items = all.filter((e) => e.section === sec);
      return items.length ? `## ${sec}\n${items.map((e) => e.text).join('\n')}` : '';
    }).filter(Boolean).join('\n\n');
    return { module, file, empty: false, text };
  }

  const words = keywords.map((w) => w.toLowerCase()).filter((w) => w.length > 3);
  const picked = all.filter((e) =>
    PRIORITY_SECTIONS.includes(e.section) || words.some((w) => e.text.toLowerCase().includes(w)));
  let text = '';
  for (const sec of SECTIONS) {
    const items = picked.filter((e) => e.section === sec);
    if (items.length) text += `## ${sec}\n${items.map((e) => e.text).join('\n')}\n\n`;
  }
  text = text.slice(0, MAX_INJECT_CHARS);
  text += `\n(filtered by relevance: ${picked.length} of ${all.length} entries; full file: ${path.relative(PROJECT_DIR, file)})`;
  return { module, file, empty: false, text };
}

export function grep(module, words) {
  const file = insightsFile(module);
  if (!fs.existsSync(file)) return [];
  const ws = words.map((w) => w.toLowerCase());
  return entries(readLines(file)).filter((e) => ws.some((w) => e.text.toLowerCase().includes(w)));
}

// ---------- append-only write ----------

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export function validateEntry(section, entry) {
  if (!entry.startsWith('- ')) return 'an entry must start with "- "';
  if (entry.includes('\n')) return 'an entry must be a single line';
  const re = section === 'Session Notes' ? SESSION_NOTE_RE : ENTRY_RE;
  if (!re.test(entry)) {
    return section === 'Session Notes'
      ? 'format: - YYYY-MM-DD · <topic> · <summary>'
      : 'format: - YYYY-MM-DD · <area> · <fact> → <action, because reason> · <evidence>';
  }
  return null;
}

/** True when every line of `before` appears in `after` in the same order (after only ADDS lines). */
export function isPureAppend(before, after) {
  let j = 0;
  for (let i = 0; i < before.length; i++) {
    while (j < after.length && after[j] !== before[i]) j++;
    if (j === after.length) return false;
    j++;
  }
  return after.length >= before.length;
}

/**
 * Append entries to the end of a section. Never touches existing lines:
 * builds the new content by insertion only, verifies the invariant, writes atomically.
 */
export function append(module, section, newEntries) {
  if (!MODULES.includes(module)) throw new Error(`unknown module "${module}" (available: ${MODULES.join(', ')})`);
  const file = insightsFile(module);
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist`);
  const before = readLines(file);
  const sec = parseSections(before).find((s) => s.heading.toLowerCase() === section.toLowerCase());
  if (!sec) throw new Error(`no section "## ${section}" in ${path.relative(PROJECT_DIR, file)} (available: ${SECTIONS.join(' · ')})`);

  const existing = new Set(entries(before).map((e) => norm(e.text)));
  const added = [];
  const skipped = [];
  for (const raw of newEntries) {
    const entry = raw.trim();
    const err = validateEntry(sec.heading, entry);
    if (err) throw new Error(`${err}\n  got: ${entry}`);
    if (existing.has(norm(entry))) { skipped.push(entry); continue; }
    existing.add(norm(entry));
    added.push(entry);
  }
  if (added.length === 0) return { file, added, skipped };

  // Insert after the last non-blank line of the section (or after the heading).
  let last = sec.start;
  for (let i = sec.start + 1; i < sec.end; i++) if (before[i].trim() !== '') last = i;
  const insert = last === sec.start ? ['', ...added] : added;
  const after = [...before.slice(0, last + 1), ...insert, ...before.slice(last + 1)];

  if (!isPureAppend(before, after) || after.length !== before.length + insert.length) {
    throw new Error('append-only invariant violated — file NOT changed');
  }
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, after.join('\n'));
  fs.renameSync(tmp, file);
  return { file, added, skipped };
}

// ---------- lint ----------

export function lint(module) {
  const file = insightsFile(module);
  if (!fs.existsSync(file)) return { module, missing: true };
  const lines = readLines(file);
  const sections = parseSections(lines);
  const problems = [];
  for (const s of SECTIONS) if (!sections.some((x) => x.heading === s)) problems.push(`missing section "## ${s}"`);
  for (const x of sections) if (!SECTIONS.includes(x.heading)) problems.push(`unknown section "## ${x.heading}"`);
  const all = entries(lines);
  for (const e of all) {
    const err = validateEntry(e.section, e.text);
    if (err) problems.push(`[${e.section}] ${err}: ${e.text.slice(0, 80)}`);
  }
  const counts = Object.fromEntries(SECTIONS.map((s) => [s, all.filter((e) => e.section === s).length]));
  if (all.length > MAX_ENTRIES) problems.push(`${all.length} entries > ${MAX_ENTRIES} — time to review or split into INSIGHTS-<domain>.md`);
  return { module, total: all.length, counts, problems };
}

// ---------- session state for hooks ----------

const STATE_DIR = path.join(os.tmpdir(), 'devdigest-insights');

export function loadState(sessionId) {
  try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${safeId(sessionId)}.json`), 'utf8')); }
  catch { return { injected: [], wrapupEdits: 0 }; }
}

export function saveState(sessionId, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, `${safeId(sessionId)}.json`), JSON.stringify(state));
}

const safeId = (id) => String(id || 'unknown').replace(/[^\w.-]/g, '_');

export async function readStdinJson() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim() ? JSON.parse(data) : {};
}

// ---------- CLI ----------

function usage() {
  return `usage: insights.mjs <command>
  route <path...>                      → module(s) for paths
  detect "<prompt>"                    → modules from the prompt + git status
  show <module> [keywords...]          → content to read (large file → filtered by relevance)
  grep <module> <word...>              → similar existing entries (dedup before writing)
  append <module> "<section>" "<entry>" [...]  → append-only write (the only allowed way)
  lint [module]                        → format and size check
modules: ${MODULES.join(', ')}
sections: ${SECTIONS.join(' · ')}`;
}

function main(argv) {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case 'route':
      console.log(routePaths(args).join('\n'));
      return 0;
    case 'detect':
      console.log([...new Set([...detectFromPrompt(args.join(' ')), ...detectFromGit()])].join('\n'));
      return 0;
    case 'show': {
      const r = show(args[0], args.slice(1));
      console.log(r.empty ? `${path.relative(PROJECT_DIR, r.file)}: no entries yet` : r.text);
      return 0;
    }
    case 'grep': {
      const hits = grep(args[0], args.slice(1));
      console.log(hits.length ? hits.map((e) => `[${e.section}] ${e.text}`).join('\n') : 'no matches');
      return 0;
    }
    case 'append': {
      const [module, section, ...items] = args;
      if (!module || !section || items.length === 0) { console.error(usage()); return 2; }
      const r = append(module, section, items);
      for (const e of r.added) console.log(`+ ${path.relative(PROJECT_DIR, r.file)} [${section}] ${e}`);
      for (const e of r.skipped) console.log(`= duplicate, skipped: ${e}`);
      return 0;
    }
    case 'lint': {
      let bad = 0;
      for (const m of args.length ? args : MODULES) {
        const r = lint(m);
        if (r.missing) { console.log(`${m}: file missing`); bad++; continue; }
        console.log(`${m}: ${r.total} entries ${JSON.stringify(r.counts)}`);
        for (const p of r.problems) { console.log(`  ! ${p}`); bad++; }
      }
      return bad ? 1 : 0;
    }
    default:
      console.error(usage());
      return cmd ? 2 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`insights: ${e.message}`); process.exitCode = 1; }
}
