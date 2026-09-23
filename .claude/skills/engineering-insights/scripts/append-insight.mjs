#!/usr/bin/env node
// Append-only writer for INSIGHTS.md files — the only way the
// engineering-insights skill writes. It inserts lines and never changes or
// removes an existing one; anything else is refused with exit 1 and the file
// left byte-for-byte as it was.
//
//   node append-insight.mjs <file> "<Section>" [--under "<text>"] <<'EOF'
//   - **YYYY-MM-DD** — claim. Evidence: `path:line`
//   EOF
//
// Every entry outside "Session notes" must cite a `path:line`, or it is refused.
// <file> is relative to the repo root, wherever this runs from. Without
// --under the entry goes to the end of the section; with --under it becomes an
// indented sub-bullet of the one entry in that section containing <text>.

import { lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const USAGE =
  'usage: node append-insight.mjs <file> "<Section>" [--under "<text>"] <<\'EOF\' … EOF';
const ENTRY_START = /^- \*\*\d{4}-\d{2}-\d{2}\*\* — \S/;
const DATED_BULLET = /^(\s*)- \*\*\d{4}-\d{2}-\d{2}\*\* — (.*)$/;
const SECTION_END = /^#{1,2} /;

function fail(message, suffix = ' — nothing written.') {
  process.stderr.write(`append-insight: ${message}${suffix}\n`);
  process.exit(1);
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

// ── arguments ────────────────────────────────────────────────────────────────
const positional = [];
let under = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--under') {
    under = argv[++i];
    if (!under || !under.trim()) fail('--under needs the text of an existing entry');
  } else {
    positional.push(argv[i]);
  }
}
if (positional.length !== 2) fail(USAGE);
const [fileArg, section] = positional;

// ── target file ──────────────────────────────────────────────────────────────
const file = resolve(ROOT, fileArg);
const rel = relative(ROOT, file).split(sep).join('/');
if (rel.startsWith('../') || rel === '..' || isAbsolute(rel)) fail(`${fileArg} is outside the repo`);
if (basename(file) !== 'INSIGHTS.md') fail(`${rel} is not an INSIGHTS.md file`);
if (rel.startsWith('server/clones/')) fail(`${rel} is inside server/clones/, a cloned copy`);
let stat;
try {
  stat = lstatSync(file);
} catch {
  fail(`${rel} does not exist; this script never creates files — ask the user`);
}
if (!stat.isFile()) fail(`${rel} is not a regular file`);

// ── entry ────────────────────────────────────────────────────────────────────
if (process.stdin.isTTY) fail(`pass the entry on stdin. ${USAGE}`);
const entry = readFileSync(0, 'utf8').replace(/\s+$/, '').split('\n').map((l) => l.replace(/\s+$/, ''));
if (!entry[0]) fail('the entry on stdin is empty');
if (!ENTRY_START.test(entry[0])) fail('the entry must start with "- **YYYY-MM-DD** — "');
for (const line of entry.slice(1)) {
  if (!/^ {2,}\S/.test(line)) {
    fail('continuation lines must be indented by 2+ spaces, with no blank lines in between');
  }
}
const claimOf = (lines) =>
  squash([lines[0].match(DATED_BULLET)[2], ...lines.slice(1)].join(' '));
const claim = claimOf(entry);
// Evidence is a backticked `file.ext:line` (`:12-18`, `:4,22` too). The letter
// extension keeps `localhost:3101` or `127.0.0.1:5433` from passing as a path.
// Only "Session notes" lines are exempt.
const EVIDENCE = /`[^`\s]*\.[A-Za-z][A-Za-z0-9]*:\d+(?:[-,]\d+)*`/;
if (section !== 'Session notes' && !EVIDENCE.test(claim)) {
  fail('the entry needs evidence as a backticked `path:line`, e.g. `src/app.ts:42`');
}

// ── current content ──────────────────────────────────────────────────────────
const original = readFileSync(file, 'utf8');
const lines = (original.endsWith('\n') ? original.slice(0, -1) : original).split('\n');

// Every dated bullet (any depth) with its continuation lines, for the duplicate check.
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(DATED_BULLET);
  if (!m) continue;
  const block = [lines[i]];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || /^\s*- /.test(l) || SECTION_END.test(l)) break;
    if (l.length - l.trimStart().length < m[1].length + 2) break;
    block.push(l);
  }
  if (claimOf(block) === claim) fail(`${rel}:${i + 1} already says this`);
}

// ── section ──────────────────────────────────────────────────────────────────
const headings = lines.flatMap((l, i) => (l === `## ${section}` ? [i] : []));
if (headings.length !== 1) {
  const known = lines.filter((l) => l.startsWith('## ')).map((l) => `"${l.slice(3)}"`);
  fail(
    `${rel} has ${headings.length ? 'several' : 'no'} "## ${section}" heading(s); ` +
      `sections: ${known.join(', ')}. This script never creates or renames sections`,
  );
}
const head = headings[0];
let end = lines.length;
for (let i = head + 1; i < lines.length; i++) {
  if (SECTION_END.test(lines[i])) {
    end = i;
    break;
  }
}

// ── insertion point ──────────────────────────────────────────────────────────
let at;
let inserted;
if (under === null) {
  let last = head;
  for (let i = head + 1; i < end; i++) if (lines[i].trim()) last = i;
  at = last + 1;
  inserted = last === head ? ['', ...entry] : [...entry];
} else {
  // A top-level entry block: its bullet line plus everything up to the next
  // blank line, top-level line or heading (continuations and sub-bullets).
  const blocks = [];
  for (let i = head + 1; i < end; i++) {
    if (!lines[i].startsWith('- ')) continue;
    let j = i + 1;
    while (j < end && lines[j].trim() && /^\s/.test(lines[j])) j++;
    blocks.push({ start: i, end: j });
  }
  const needle = squash(under);
  const hits = blocks.filter((b) => squash(lines.slice(b.start, b.end).join(' ')).includes(needle));
  if (hits.length !== 1) {
    fail(`--under text matches ${hits.length} entries in "## ${section}"; it must match exactly one`);
  }
  at = hits[0].end;
  inserted = entry.map((l) => `  ${l}`);
}
if (at < lines.length && SECTION_END.test(lines[at])) inserted.push('');

// ── invariant: old lines all present, unchanged, in order ────────────────────
const next = [...lines.slice(0, at), ...inserted, ...lines.slice(at)];
const intact =
  next.length === lines.length + inserted.length &&
  lines.every((l, i) => next[i < at ? i : i + inserted.length] === l);
if (!intact) fail('internal check failed: an existing line would change');

// ── atomic write ─────────────────────────────────────────────────────────────
const output = `${next.join('\n')}\n`;
if (readFileSync(file, 'utf8') !== original) fail(`${rel} changed while this ran; re-run`);
const tmp = `${file}.tmp-${process.pid}`;
writeFileSync(tmp, output, { mode: stat.mode });
renameSync(tmp, file);
if (readFileSync(file, 'utf8') !== output) {
  fail(`${rel} was written but reads back differently`, ' — check it with git diff.');
}

process.stdout.write(
  `+${inserted.length} lines at ${rel}:${at + 1}; removed 0\n` +
    inserted.map((l) => `+ ${l}`).join('\n') +
    '\n' +
    (original.endsWith('\n')
      ? ''
      : `note: the file had no final newline; one was added after line ${lines.length}, ` +
        'so git diff shows that line as -/+ with its text unchanged\n'),
);
