#!/usr/bin/env node
// Append-only writer for INSIGHTS.md: inserts one line at the end of a section and
// verifies that every pre-existing line is still present, unchanged and in order.
// Usage: node append-insight.mjs <INSIGHTS.md path> "<Section>" "- YYYY-MM-DD — <what> → <why> (<ref>)"
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const SECTIONS = [
  'What Works', "What Doesn't Work", 'Codebase Patterns', 'Tool & Library Notes',
  'Recurring Errors & Fixes', 'Session Notes', 'Open Questions',
];
const fail = (msg) => { console.error(`append-insight: ${msg}`); process.exit(1); };

const [file, section, entry] = process.argv.slice(2);
if (!file || !section || !entry) fail('usage: append-insight.mjs <file> "<Section>" "<entry line>"');
if (!/(^|\/)INSIGHTS(-[\w-]+)?\.md$/.test(file)) fail(`refusing to write a non-INSIGHTS file: ${file}`);
if (!existsSync(file)) fail(`${file} does not exist — will not create it (no blind overwrite)`);
if (!SECTIONS.includes(section)) fail(`unknown section "${section}". Use one of: ${SECTIONS.join(' | ')}`);
if (entry.includes('\n')) fail('entry must be a single line');
if (!/^- \d{4}-\d{2}-\d{2} — \S.*$/.test(entry)) fail('entry must look like "- YYYY-MM-DD — <what> → <why> (<ref>)"');

const original = readFileSync(file, 'utf8');
const before = original.split('\n');

// Duplicate check: same text after the date (case/space-insensitive) anywhere in the file.
const body = (l) => l.replace(/^- \d{4}-\d{2}-\d{2} — /, '').replace(/\s+/g, ' ').trim().toLowerCase();
if (before.some((l) => l.startsWith('- ') && body(l) === body(entry))) {
  console.log(`duplicate — already in ${file}, nothing written`);
  process.exit(0);
}

const start = before.findIndex((l) => l.trim() === `## ${section}`);
if (start === -1) fail(`section "## ${section}" not found in ${file}`);
let end = before.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
if (end === -1) end = before.length;
let insertAt = start + 1;
for (let i = start + 1; i < end; i++) if (before[i].trim() !== '') insertAt = i + 1;

const after = [...before.slice(0, insertAt), entry, ...before.slice(insertAt)];

// Safety net: removing exactly the added line must give back the original byte-for-byte.
if (after.filter((_, i) => i !== insertAt).join('\n') !== original) {
  fail('verification failed — existing content would change; nothing written');
}

// Someone else changed the file while we worked → don't clobber their edit.
if (readFileSync(file, 'utf8') !== original) fail(`${file} changed during the write; re-run`);

const tmp = `${file}.tmp-${process.pid}`;
writeFileSync(tmp, after.join('\n'));
renameSync(tmp, file); // atomic replace: either the old file or the fully written new one
console.log(`appended to ${file} → ## ${section}`);
const entries = after.filter((l) => l.startsWith('- ')).length;
if (entries > 200) console.log(`warning: ${entries} entries (>200) — tell the user it's time to prune or split into INSIGHTS-<domain>.md`);
