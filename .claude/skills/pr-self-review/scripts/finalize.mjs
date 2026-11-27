#!/usr/bin/env node
// Steps 9–14 — apply verifications + suppressions, compute the verdict, store the result, print the report.
//   node finalize.mjs [--override "<reason>"]     (--override only when the USER typed it)
import path from 'node:path';
import { fingerprint, repoRoot } from './lib/git.mjs';
import { findingFingerprint } from './lib/grounding.mjs';
import { readJson, statePaths, today, writeJson } from './lib/util.mjs';

const root = repoRoot();
const P = statePaths(root);
const manifest = readJson(P.manifest);
const grounded = readJson(P.grounded);
const checksStatic = readJson(P.checksStatic, null);
const checksBuild = readJson(P.checksBuild, null);

const oi = process.argv.indexOf('--override');
const overrideReason = oi === -1 ? null : (process.argv[oi + 1] ?? '').trim();
if (oi !== -1 && !overrideReason) {
  console.error('--override needs a reason: --override "why merging with these CRITICALs is acceptable"');
  process.exit(2);
}

const nowFp = fingerprint(root, { baseSha: manifest.base_sha });
if (nowFp !== manifest.fingerprint) {
  console.error('✗ the working tree changed during the review — results would not match the code. Re-run /pr-self-review.');
  process.exit(1);
}

const incomplete = [];
for (const [name, c] of [['static checks', checksStatic], ['build checks', checksBuild]]) {
  if (!c) incomplete.push(`${name} did not run`);
  else if (c.fingerprint !== manifest.fingerprint) incomplete.push(`${name} are stale (ran on another diff)`);
}
if (grounded.fingerprint !== manifest.fingerprint) incomplete.push('grounding is stale — re-run ground.mjs');
for (const e of grounded.bucket_errors) incomplete.push(`bucket ${e.bucket}: ${e.reason}`);

// Verification of reviewer CRITICALs.
const findings = grounded.findings.map((f) => ({ ...f }));
const verifyById = new Map(grounded.needs_verification.map((v) => [v.id, v]));
for (const f of findings) {
  if (f.severity !== 'CRITICAL') continue;
  if (!f.verification) {
    const v = verifyById.get(f.id);
    const res = v ? readJson(path.join(root, v.output), null) : null;
    if (!res || !['CONFIRMED', 'REJECTED'].includes(res.verdict)) {
      incomplete.push(`${f.id} (${f.file}:${f.line}) has no verifier verdict at ${v?.output ?? '?'}`);
      continue;
    }
    f.verification = { verdict: res.verdict, reason: res.reason ?? '' };
    writeJson(path.join(P.cache, `verify-${f.verify_key}.json`), f.verification);
  }
  if (f.verification.verdict === 'REJECTED') {
    f.severity = 'WARNING';
    f.downgraded = `verifier rejected the CRITICAL: ${f.verification.reason}`;
  }
}

// Deterministic findings join the list (always "new": they are about this diff).
const checkFindings = [...(checksStatic?.findings ?? []), ...(checksBuild?.findings ?? [])].map((f, i) => ({
  id: `C${String(i + 1).padStart(3, '0')}`,
  ...f,
  skills: [f.skill],
  is_new: true,
  fingerprint: findingFingerprint(f.skill, f.file ?? '', `${f.title}`),
}));
const all = [...checkFindings, ...findings];

// Suppressions (.devdigest/self-review-ignore.json) — written by the user, never by the skill.
const ignore = readJson(P.ignore, { version: 1, suppressions: [] });
const td = today();
const expiredNotes = [];
for (const f of all) {
  const s = (ignore.suppressions ?? []).find((x) => (f.fingerprints ?? [f.fingerprint]).includes(x.fingerprint));
  if (!s) continue;
  if (s.expires && s.expires < td) {
    expiredNotes.push({
      id: `S-${f.id}`,
      source: 'check',
      skill: 'check:suppressions',
      skills: ['check:suppressions'],
      severity: 'WARNING',
      title: `Suppression expired on ${s.expires} for ${f.id}`,
      why: `Suppression "${s.reason}" no longer applies, so ${f.id} counts again.`,
      fix: 'Fix the finding, or renew the entry in .devdigest/self-review-ignore.json with a new reason/expiry.',
      file: f.file,
      line: f.line,
      is_new: true,
    });
  } else {
    f.suppressed = { reason: s.reason, expires: s.expires ?? null, added_by: s.added_by ?? null };
  }
}
all.push(...expiredNotes);

const blocking = all.filter((f) => f.severity === 'CRITICAL' && !f.suppressed);
const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
for (const f of all) if (!f.suppressed) counts[f.severity]++;

let verdict = incomplete.length || blocking.length ? 'fail' : 'pass';
let override = null;
if (overrideReason && verdict === 'fail') {
  if (incomplete.length) {
    console.error('✗ --override cannot pass an incomplete review — fix the incomplete steps first.');
  } else {
    verdict = 'pass';
    override = { reason: overrideReason, critical_count: blocking.length, at: new Date().toISOString() };
  }
}

const result = {
  version: 1,
  created_at: new Date().toISOString(),
  branch: manifest.branch,
  head_sha: manifest.head_sha,
  base_sha: manifest.base_sha,
  fingerprint: manifest.fingerprint,
  commit_fingerprint: manifest.commit_fingerprint,
  verdict,
  override,
  incomplete,
  counts,
  blocking: blocking.map((f) => f.id),
  findings: all,
  pre_existing: grounded.pre_existing,
  dropped: grounded.dropped,
  skills_run: [...new Set(readJson(P.plan).buckets.map((b) => b.skill))],
  cache_hits: readJson(P.plan).totals.cached,
};
writeJson(path.join(P.results, `${manifest.fingerprint}.json`), result);
writeJson(P.latest, result);

// ---------------------------------------------------------------- report
const loc = (f) => (f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '—');
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').slice(0, 220);
const out = [];
out.push(`## PR self-review — ${verdict === 'pass' ? (override ? 'PASS (override)' : 'PASS') : 'FAIL'}`);
out.push('');
out.push(`\`${manifest.branch}\` @ \`${manifest.head_sha.slice(0, 7)}\` vs \`${manifest.base_ref ?? 'main'}\` · skills: ${result.skills_run.join(', ') || 'none'} · cache hits: ${result.cache_hits}`);
out.push(`**${counts.CRITICAL} CRITICAL · ${counts.WARNING} WARNING · ${counts.SUGGESTION} SUGGESTION** (new code only)`);
if (override) out.push(`\n> ⚠ Override by user: "${override.reason}" — ${override.critical_count} CRITICAL(s) accepted. This is recorded in the GitHub status and must go in the PR body.`);
if (incomplete.length) {
  out.push('\n### Review incomplete (blocks)');
  for (const i of incomplete) out.push(`- ${i}`);
}
const visible = all.filter((f) => !f.suppressed);
if (visible.length) {
  out.push('\n| id | severity | skill | location | finding | fix |');
  out.push('|---|---|---|---|---|---|');
  for (const f of visible) {
    out.push(`| ${f.id} | ${f.severity}${f.downgraded ? ' ↓' : ''} | ${f.skills.join(', ')} | ${loc(f)} | ${cell(f.title)}: ${cell(f.why)} | ${cell(f.fix)} |`);
  }
}
const suppressed = all.filter((f) => f.suppressed);
if (suppressed.length) out.push(`\nSuppressed: ${suppressed.map((f) => `${f.id} (${f.suppressed.reason})`).join('; ')}`);
if (grounded.pre_existing.length) {
  out.push(`\n### Pre-existing (not introduced by this diff — never blocks): ${grounded.pre_existing.length}`);
  for (const f of grounded.pre_existing.slice(0, 15)) out.push(`- ${f.severity} · ${f.skills.join(', ')} · ${loc(f)} — ${cell(f.title)}`);
}
if (grounded.dropped.length) out.push(`\nDropped as ungrounded/invalid: ${grounded.dropped.length} (see ${path.relative(root, P.grounded)})`);
if (blocking.length && !override) {
  out.push('\n### Blocking — PR must not be opened or merged');
  out.push('If a CRITICAL is a false positive, the user may add a suppression to `.devdigest/self-review-ignore.json`:');
  out.push('```json');
  for (const f of blocking.filter((x) => x.source !== 'check')) {
    out.push(JSON.stringify({ fingerprint: f.fingerprint, skill: f.skill, file: f.file, reason: '<why this is not a defect>', added_by: '<name>', expires: '<YYYY-MM-DD>' }));
  }
  out.push('```');
}
if (manifest.dirty) {
  out.push('\n⚠ The review covered uncommitted/untracked changes. The gate and the GitHub status accept it only after the committed state equals what was reviewed — commit everything that belongs in the PR.');
}
out.push(`\nresult → ${path.relative(root, path.join(P.results, `${manifest.fingerprint}.json`))}`);
console.log(out.join('\n'));
