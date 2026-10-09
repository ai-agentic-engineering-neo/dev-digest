#!/usr/bin/env node
// Guards the INSIGHTS.md contract: append-only against the git baseline (index, else HEAD),
// all 7 sections present and ordered, no duplicate entry titles. Usage:
//   node .claude/skills/engineering-insights/scripts/verify.mjs [file ...] [--base <baseline-file>]
// With no files, checks every <package>/INSIGHTS.md. Exit code 1 on any problem.
import { readFileSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { PACKAGES, repoRoot, checkAppendOnly, checkStructure, gitBaseline } from './lib.mjs';

const root = repoRoot();
const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const baseFile = baseIdx > -1 ? args.splice(baseIdx, 2)[1] : null;
const files = args.length ? args : PACKAGES.map((p) => join(p, 'INSIGHTS.md'));
if (baseFile && files.length !== 1) {
  console.error('--base needs exactly one file to check');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const abs = isAbsolute(file) ? file : join(root, file);
  const relPath = relative(root, abs);
  if (!existsSync(abs)) {
    console.log(`✗ ${relPath}: file is missing`);
    failed = true;
    continue;
  }
  const text = readFileSync(abs, 'utf8');
  const { problems, warnings, entries } = checkStructure(text);
  const base = baseFile ? readFileSync(baseFile, 'utf8') : gitBaseline(relPath, root);
  if (base !== null) {
    const r = checkAppendOnly(base, text);
    if (!r.ok) problems.push(`baseline line ${r.line} was changed or removed: ${JSON.stringify(r.missing)}`);
  }
  for (const w of warnings) console.log(`! ${relPath}: ${w}`);
  if (problems.length) {
    failed = true;
    for (const p of problems) console.log(`✗ ${relPath}: ${p}`);
  } else {
    console.log(`✓ ${relPath}: ${entries} entries${base === null ? ' (no git baseline — append check skipped)' : ''}`);
  }
}
process.exit(failed ? 1 : 0);
