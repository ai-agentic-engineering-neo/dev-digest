#!/usr/bin/env node
// Step 8 — load every bucket's findings (fresh or cached), ground them, dedupe, list CRITICALs to verify.
//   node ground.mjs
import path from 'node:path';
import fs from 'node:fs';
import { repoRoot } from './lib/git.mjs';
import { groundFindings } from './lib/grounding.mjs';
import { readJson, readLines, sha256, sha256File, statePaths, writeJson } from './lib/util.mjs';

const root = repoRoot();
const P = statePaths(root);
const manifest = readJson(P.manifest);
const plan = readJson(P.plan);
if (plan.fingerprint !== manifest.fingerprint) throw new Error('plan.json is stale — re-run collect.mjs and route.mjs');

const raw = [];
const bucketErrors = [];
for (const b of plan.buckets) {
  const cacheFile = path.join(P.cache, `bucket-${b.cache_key}.json`);
  let data;
  try {
    data = b.cached ? readJson(cacheFile) : readJson(path.join(root, b.output));
  } catch (e) {
    bucketErrors.push({ bucket: b.id, reason: b.cached ? `cache unreadable: ${e.message}` : `reviewer output missing or invalid JSON (${b.output})` });
    continue;
  }
  if (!data || !Array.isArray(data.findings)) {
    bucketErrors.push({ bucket: b.id, reason: `${b.output}: expected { "findings": [...] }` });
    continue;
  }
  if (!b.cached) writeJson(cacheFile, data);
  for (const f of data.findings) raw.push({ ...f, skill: b.skill, bucket: b.id });
}

const linesCache = new Map();
const linesOf = (file) => {
  if (!linesCache.has(file)) linesCache.set(file, readLines(path.join(root, file)));
  return linesCache.get(file);
};
const rangesByFile = new Map(manifest.files.map((f) => [f.path, f.ranges]));
const { findings, pre_existing, dropped } = groundFindings(raw, {
  bucketFiles: new Map(plan.buckets.map((b) => [b.id, new Set(b.files)])),
  linesOf,
  rangesOf: (file) => rangesByFile.get(file) ?? [],
});

// Every new CRITICAL from a reviewer gets an independent verifier, unless an identical one was verified before.
const needsVerification = [];
for (const f of findings.filter((x) => x.severity === 'CRITICAL')) {
  f.verify_key = sha256('verify-v1', f.fingerprint, sha256File(path.join(root, f.file)));
  const cached = readJson(path.join(P.cache, `verify-${f.verify_key}.json`), null);
  if (cached) {
    f.verification = { ...cached, cached: true };
    continue;
  }
  needsVerification.push({
    id: f.id,
    file: f.file,
    line: f.line,
    quote: f.quote,
    title: f.title,
    skills: f.skills,
    output: path.relative(root, path.join(P.verifyDir, `${f.id}.json`)),
  });
}

fs.rmSync(P.verifyDir, { recursive: true, force: true });
writeJson(P.grounded, {
  version: 1,
  fingerprint: manifest.fingerprint,
  findings,
  pre_existing,
  dropped,
  bucket_errors: bucketErrors,
  needs_verification: needsVerification,
});

const count = (arr, s) => arr.filter((f) => f.severity === s).length;
console.log(`new findings: ${count(findings, 'CRITICAL')} CRITICAL · ${count(findings, 'WARNING')} WARNING · ${count(findings, 'SUGGESTION')} SUGGESTION`);
console.log(`pre-existing (non-blocking): ${pre_existing.length} · dropped (ungrounded/invalid): ${dropped.length}`);
for (const e of bucketErrors) console.log(`✗ bucket ${e.bucket}: ${e.reason}`);
if (needsVerification.length) {
  console.log(`\n${needsVerification.length} CRITICAL(s) need an independent verifier:`);
  for (const v of needsVerification) console.log(`  ${v.id} ${v.file}:${v.line} — ${v.title} → write ${v.output}`);
} else {
  console.log('\nno CRITICAL needs verification');
}
console.log(`→ ${P.grounded}`);
