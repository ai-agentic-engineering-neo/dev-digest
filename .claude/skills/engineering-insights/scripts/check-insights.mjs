#!/usr/bin/env node
// Validates the per-package INSIGHTS.md files: sections, entry format and length, required
// fields, stale Evidence paths, duplicate titles, secret-looking strings.
// Usage: node .claude/skills/engineering-insights/scripts/check-insights.mjs [file ...]
// Exit 1 on any ERROR (must fix); 0 when there are only warnings.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PACKAGES = ['client', 'server', 'reviewer-core', 'e2e'];
const SECTIONS = [
  'What Works',
  "What Doesn't Work",
  'Codebase Patterns',
  'Tool & Library Notes',
  'Recurring Errors & Fixes',
  'Open Questions',
];
const OPEN_QUESTIONS = 'Open Questions';
// Past ~30 entries the file stops being skimmable at session start → time for an audit.
const MAX_ENTRIES = 30;
// What/Why/Rule/Evidence + one spare; cross-package entries may add an "Also in" line.
const MAX_LINES = 5;
const HEADER = /^### (\d{4}-\d{2}-\d{2}) [—–-] (.+)$/;
const SECRET = /ghp_|gho_|github_pat_|sk-[A-Za-z0-9]{8}|xox[abp]-|AKIA[0-9A-Z]{12}|-----BEGIN [A-Z ]*PRIVATE KEY|https:\/\/[^\s/@]+:[^\s/@]+@/;
// Only paths with a directory part are checked; bare file names are too ambiguous.
const PATH_TOKEN = /[\w@.-]+(?:\/[\w@.[\]-]+)+\.(?:tsx?|mjs|cjs|js|json|md|sql|ya?ml|sh)\b/g;

const errors = [];
const warnings = [];
const titles = new Map();

const args = process.argv.slice(2);
const files = args.length
  ? args.map((f) => resolve(f))
  : PACKAGES.map((p) => join(ROOT, p, 'INSIGHTS.md'));

for (const file of files) {
  const rel = relative(ROOT, file);
  if (!existsSync(file)) {
    errors.push(`${rel}: file missing`);
    continue;
  }
  const pkgDir = dirname(file);
  // Blank out HTML comments (format hints) but keep newlines so line numbers stay right.
  const text = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));
  const entries = [];
  const seenSections = new Set();
  let section = null;
  let entry = null;
  let lastDate = null;

  text.split('\n').forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (SECRET.test(line)) errors.push(`${at}: looks like a secret or token — remove it`);

    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      if (!SECTIONS.includes(section)) errors.push(`${at}: unknown section "${section}" (allowed: ${SECTIONS.join(', ')})`);
      seenSections.add(section);
      entry = null;
      lastDate = null;
      return;
    }
    if (line.startsWith('### ')) {
      const m = HEADER.exec(line);
      if (!section) errors.push(`${at}: entry outside a section`);
      if (!m) {
        errors.push(`${at}: header must be "### YYYY-MM-DD — short title"`);
        entry = null;
        return;
      }
      const [, date, title] = m;
      if (lastDate && date > lastDate) warnings.push(`${at}: not newest-first within "${section}"`);
      lastDate = date;
      entry = { at, section, title: title.trim(), lines: [] };
      entries.push(entry);
      return;
    }
    if (!line.trim()) return;
    if (entry) entry.lines.push(line.trim());
    else if (section) warnings.push(`${at}: text outside an entry`);
  });

  for (const s of SECTIONS) {
    if (!seenSections.has(s)) errors.push(`${rel}: missing section "## ${s}"`);
  }

  for (const e of entries) {
    const field = (name) => e.lines.find((l) => l.startsWith(`- ${name}:`));
    const alsoIn = field('Also in');
    const required = e.section === OPEN_QUESTIONS ? ['What', 'Evidence'] : ['What', 'Why', 'Rule', 'Evidence'];
    for (const name of required) {
      if (!field(name)) errors.push(`${e.at}: missing "- ${name}:"`);
    }
    const limit = MAX_LINES + (alsoIn ? 1 : 0);
    if (e.lines.length > limit) errors.push(`${e.at}: ${e.lines.length} lines, max ${limit} — tighten it`);

    for (const p of (field('Evidence') ?? '').match(PATH_TOKEN) ?? []) {
      if (!existsSync(join(pkgDir, p)) && !existsSync(join(ROOT, p))) {
        warnings.push(`${e.at}: Evidence path "${p}" not found — stale entry?`);
      }
    }

    const key = e.title.toLowerCase().replace(/\s+/g, ' ');
    if (!titles.has(key)) titles.set(key, []);
    titles.get(key).push({ at: e.at, rel, crossPackage: Boolean(alsoIn) });
  }

  if (entries.length > MAX_ENTRIES) {
    warnings.push(`${rel}: ${entries.length} entries (> ${MAX_ENTRIES}) — run /engineering-insights audit`);
  }
  console.log(`${rel}: ${entries.length} entries`);
}

for (const [title, hits] of titles) {
  if (hits.length < 2) continue;
  const where = hits.map((h) => h.at).join(', ');
  if (new Set(hits.map((h) => h.rel)).size < hits.length) {
    errors.push(`duplicate title "${title}" in one file: ${where}`);
  } else if (!hits.every((h) => h.crossPackage)) {
    warnings.push(`same title "${title}" in several packages without "- Also in:": ${where}`);
  }
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `${errors.length} error(s), ${warnings.length} warning(s)` : `OK — ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
