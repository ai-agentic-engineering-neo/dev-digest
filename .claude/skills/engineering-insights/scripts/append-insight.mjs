#!/usr/bin/env node
/**
 * append-insight.mjs — append ONE entry to a module's INSIGHTS.md, safely.
 *
 * Deterministic part of the engineering-insights skill: the model decides WHAT
 * to write, this script guarantees HOW it is written:
 *   - creates INSIGHTS.md from the template if it is missing;
 *   - inserts the entry at the end of the requested section (append-only);
 *   - refuses near-duplicates (same normalized finding already in the file);
 *   - verifies every pre-existing line is still present, in order, before
 *     writing — so nothing is ever overwritten or reordered.
 *
 * Usage (from the repository root):
 *   node .claude/skills/engineering-insights/scripts/append-insight.mjs \
 *     --module client --section "Fixes & gotchas" \
 *     --entry "- **2026-11-28** · <finding> — evidence: \`client/src/x.ts:12\`"
 * Add --dry-run to print the result without writing.
 * Exit codes: 0 appended, 3 duplicate (nothing written), 1 usage/validation error.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULES = ['client', 'server', 'reviewer-core', 'e2e'];
const SECTIONS = ['Non-obvious dependencies', 'Fixes & gotchas', 'Measured facts', 'Surprises'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
function fail(msg, code = 1) {
  console.error(`append-insight: ${msg}`);
  process.exit(code);
}

const mod = arg('module');
const section = arg('section');
const entry = arg('entry')?.trimEnd();
const dryRun = process.argv.includes('--dry-run');

if (!MODULES.includes(mod)) fail(`--module must be one of: ${MODULES.join(', ')}`);
if (!SECTIONS.includes(section)) fail(`--section must be one of: ${SECTIONS.join(' | ')}`);
if (!entry) fail('--entry is required');
if (!/^- \*\*\d{4}-\d{2}-\d{2}\*\* · /.test(entry)) fail('entry must start with "- **YYYY-MM-DD** · "');
if (!/evidence: /.test(entry)) fail('entry must contain "evidence: " with a file:line or a command');

const template = `# ${mod} — engineering insights

Append-only log of non-obvious findings, written by agents via the
\`engineering-insights\` skill. Newest entries at the bottom of each section.
Review and prune periodically; stale entries are harmful.

${SECTIONS.map((s) => `## ${s}\n`).join('\n')}`;

const file = join(process.cwd(), mod, 'INSIGHTS.md');
const before = existsSync(file) ? readFileSync(file, 'utf8') : template;

// Duplicate check: compare the finding sentence (between "· " and " — evidence")
// with every existing entry, ignoring case, punctuation and whitespace.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const findingOf = (line) => {
  const m = line.match(/^- \*\*\d{4}-\d{2}-\d{2}\*\* · (.*?)(?: — evidence:|$)/);
  return m ? norm(m[1]) : null;
};
const newFinding = findingOf(entry.split('\n')[0]);
for (const line of before.split('\n')) {
  const f = findingOf(line);
  if (f && f === newFinding) fail(`duplicate of an existing entry, nothing written:\n  ${line}`, 3);
}

// Insert at the end of the section (before the next "## " heading or EOF).
const lines = before.replace(/\n+$/, '').split('\n');
const start = lines.findIndex((l) => l.trim() === `## ${section}`);
if (start === -1) fail(`section "## ${section}" not found in ${mod}/INSIGHTS.md`);
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) { end = i; break; }
}
let insertAt = end;
while (insertAt > start + 1 && lines[insertAt - 1].trim() === '') insertAt--;
const block = entry.split('\n');
const out = [...lines.slice(0, insertAt)];
if (insertAt === start + 1) out.push('');
out.push(...block);
if (end < lines.length) out.push('');
out.push(...lines.slice(end));
const after = out.join('\n') + '\n';

// Safety net: every old non-empty line must survive, in the same order.
const oldLines = before.split('\n').filter((l) => l.trim() !== '');
let j = 0;
for (const l of after.split('\n')) if (j < oldLines.length && l === oldLines[j]) j++;
if (j !== oldLines.length) fail('refusing to write: existing content would change');

if (dryRun) {
  process.stdout.write(after);
} else {
  writeFileSync(file, after);
  console.log(`append-insight: appended to ${mod}/INSIGHTS.md › ${section}`);
}
