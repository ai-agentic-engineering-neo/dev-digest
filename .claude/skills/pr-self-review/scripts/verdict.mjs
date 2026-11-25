#!/usr/bin/env node
// pr-self-review — step 7: merge deterministic + reviewer findings into one verdict for the CURRENT diff.
//   node verdict.mjs [--run <dir>]              write verdicts/<diffHash>.{json,md}, print the report
//   node verdict.mjs waive <F-id> <reason...>   waive one blocking CRITICAL (reason required), re-verdict
// Verdict: PASS (no unwaived blocking CRITICAL, everything ran) · BLOCK · INCOMPLETE.
// Exit codes: 0 PASS · 3 BLOCK · 4 INCOMPLETE · 1 usage/stale-run error · 2 skill-map error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, loadMap, DEFAULT_MAP, cacheDir, runDir } from './collect.mjs';
import { findingId, readUnitResults, readVerifications, bySeverity } from './findings.mjs';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readJsonIf = (p) => (fs.existsSync(p) ? readJson(p) : null);

export const verdictPath = (repo, diffHash, ext = 'json') => path.join(cacheDir(repo), 'verdicts', `${diffHash}.${ext}`);
const waiversPath = (repo) => path.join(cacheDir(repo), 'waivers.json');

export function readWaivers(repo, diffHash) {
  const all = readJsonIf(waiversPath(repo)) ?? {};
  return all[diffHash] ?? [];
}

/**
 * Pure merge. Inputs are the parsed run artifacts; nothing is read from disk here.
 * `unitResults` = readUnitResults(); `verifications` = Map(id → {decision, reason}).
 */
export function buildVerdict({ plan, checks, unitsJson, unitResults, verifications = new Map(), waivers = [] }) {
  const incomplete = [];
  const notes = [];
  if (plan.empty) {
    return finalize({ plan, verdict: 'PASS', notes: ['No changes against the base — nothing to review.'] });
  }

  // deterministic findings: never verified by an LLM, always trusted
  if (!checks) incomplete.push('checks.json is missing — run checks.mjs');
  else if (checks.diffHash !== plan.diffHash) incomplete.push('checks.json belongs to a different diff — re-run checks.mjs');
  else if (checks.status === 'incomplete') {
    for (const r of checks.results.filter((x) => x.status === 'error')) incomplete.push(`check ${r.package ? `${r.package}: ` : ''}${r.name} could not run — ${r.reason}`);
  }
  const checkFindings = (checks?.diffHash === plan.diffHash ? checks.findings : []).map((f) => {
    const base = { source: 'checks', skill: null, rule: f.rule, file: f.file ?? null, line: f.line ?? null, title: f.title };
    return { id: findingId(base), ...base, package: f.package, severity: f.severity, evidence: f.evidence ?? '', fix: f.fix ?? '', introducedByDiff: true };
  });
  const checksCritical = checkFindings.some((f) => f.severity === 'CRITICAL');

  // reviewer findings
  let reviewFindings = [];
  if (!unitsJson) {
    if (checksCritical) notes.push('LLM review skipped: deterministic checks already block (fail-fast).');
    else incomplete.push('units.json is missing — the skill review did not run');
  } else if (unitsJson.diffHash !== plan.diffHash) {
    incomplete.push('units.json belongs to a different diff — rebuild units');
  } else {
    for (const [id, r] of Object.entries(unitResults?.results ?? {})) {
      if (r.status !== 'done') incomplete.push(`review unit ${id} ${r.status}${r.error ? ` — ${r.error}` : ''}`);
    }
    reviewFindings = unitResults?.findings ?? [];
    for (const s of unitsJson.skipped ?? []) notes.push(`Not reviewed: ${s.id} ${s.skill} (${s.files.length} file(s)) — ${s.reason}`);
  }

  const changed = new Set(plan.files.map((f) => f.path));
  const info = [];
  const rejected = [];
  const kept = [];
  for (const f of reviewFindings) {
    if (!f.introducedByDiff) { info.push({ ...f, infoReason: 'pre-existing, not introduced by this diff' }); continue; }
    if (f.file && !changed.has(f.file)) { info.push({ ...f, infoReason: 'file is not part of this diff' }); continue; }
    if (f.severity === 'CRITICAL') {
      const v = verifications.get(f.id);
      if (v?.decision === 'reject') { rejected.push({ ...f, verification: v }); continue; }
      if (v?.decision === 'downgrade') { kept.push({ ...f, severity: 'WARNING', verification: v }); continue; }
      kept.push(v ? { ...f, verification: v } : { ...f, unverified: true });
      continue;
    }
    kept.push(f);
  }

  // dedup by id, keep the most severe copy
  const merged = new Map();
  for (const f of [...checkFindings, ...kept].sort(bySeverity)) if (!merged.has(f.id)) merged.set(f.id, f);
  const findings = [...merged.values()].sort(bySeverity);

  const waiverById = new Map(waivers.filter((w) => String(w.reason ?? '').trim()).map((w) => [w.id, w]));
  const blocking = [];
  const waived = [];
  for (const f of findings.filter((x) => x.severity === 'CRITICAL')) {
    const w = waiverById.get(f.id);
    if (w) waived.push({ ...f, waiver: w }); else blocking.push(f);
  }

  const verdict = blocking.length ? 'BLOCK' : incomplete.length ? 'INCOMPLETE' : 'PASS';
  return finalize({ plan, verdict, findings, blocking, waived, rejected, info, incomplete, notes, checks, unitsJson });
}

function finalize({ plan, verdict, findings = [], blocking = [], waived = [], rejected = [], info = [], incomplete = [], notes = [], checks = null, unitsJson = null }) {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity]++;
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    verdict,
    diffHash: plan.diffHash,
    head: plan.head,
    branch: plan.branch,
    base: plan.base,
    mergeBase: plan.mergeBase,
    counts,
    blocking: blocking.map((f) => f.id),
    waived: waived.map((f) => ({ id: f.id, reason: f.waiver.reason, at: f.waiver.at })),
    incomplete,
    notes,
    checks: checks ? { status: checks.status, packagesGated: checks.packagesGated } : null,
    units: unitsJson ? { reviewed: unitsJson.selected.map((u) => `${u.id} ${u.skill}`), skipped: (unitsJson.skipped ?? []).map((u) => `${u.id} ${u.skill}`) } : null,
    findings,
    rejected,
    info,
  };
}

// ---------- report ----------

const loc = (f) => (f.file ? `\`${f.file}${f.line ? `:${f.line}` : ''}\`` : '(repo)');
const who = (f) => (f.source === 'checks' ? `checks · ${f.rule}` : `${f.skill} · ${f.rule}`);

export function formatMarkdown(v) {
  const out = [];
  const head = { PASS: 'PASS ✅', BLOCK: 'BLOCK ⛔', INCOMPLETE: 'INCOMPLETE ⚠️' }[v.verdict];
  out.push(`# PR self-review: ${head}`, '');
  out.push(`Branch \`${v.branch}\` vs \`${v.base.ref}\` · diff \`${v.diffHash.slice(0, 16)}\` · CRITICAL ${v.counts.CRITICAL} (blocking ${v.blocking.length}, waived ${v.waived.length}) · WARNING ${v.counts.WARNING} · SUGGESTION ${v.counts.SUGGESTION}`, '');
  if (v.verdict === 'BLOCK') out.push('**Do not open the PR until every blocking CRITICAL is fixed or explicitly waived.**', '');
  if (v.incomplete.length) out.push('## Could not complete', ...v.incomplete.map((x) => `- ${x}`), '');

  const section = (title, list, extra = () => '') => {
    if (!list.length) return;
    out.push(`## ${title}`);
    for (const f of list) {
      out.push(`- **${f.id}** ${loc(f)} — ${f.title} _(${who(f)})_${extra(f)}`);
      if (f.evidence) out.push(`  - evidence: ${f.evidence.split('\n').slice(0, 4).join(' ⏎ ').slice(0, 400)}`);
      if (f.fix) out.push(`  - fix: ${f.fix}`);
    }
    out.push('');
  };
  const byId = new Map(v.findings.map((f) => [f.id, f]));
  section('Blocking CRITICAL', v.blocking.map((id) => byId.get(id)), (f) => (f.unverified ? ' — _not verified_' : f.verification ? ` — verified: ${f.verification.reason}` : ''));
  section('Waived CRITICAL', v.waived.map((w) => ({ ...byId.get(w.id), waiverReason: w.reason })), (f) => ` — waived: ${f.waiverReason}`);
  section('WARNING', v.findings.filter((f) => f.severity === 'WARNING'), (f) => (f.verification?.decision === 'downgrade' ? ` — downgraded from CRITICAL: ${f.verification.reason}` : ''));
  section('SUGGESTION', v.findings.filter((f) => f.severity === 'SUGGESTION'));
  if (v.rejected.length) {
    out.push('<details><summary>Rejected by the verifier</summary>', '');
    for (const f of v.rejected) out.push(`- ${f.id} ${loc(f)} — ${f.title} _(${who(f)})_ — ${f.verification.reason}`);
    out.push('', '</details>', '');
  }
  if (v.info.length) {
    out.push('<details><summary>Out of scope (pre-existing or outside the diff)</summary>', '');
    for (const f of v.info) out.push(`- ${loc(f)} — ${f.title} _(${who(f)})_ — ${f.infoReason}`);
    out.push('', '</details>', '');
  }
  if (v.notes.length) out.push('## Notes', ...v.notes.map((x) => `- ${x}`), '');
  out.push('## PR summary (paste into the PR description)', '', '```markdown', prSummary(v), '```', '');
  return out.join('\n');
}

export function prSummary(v) {
  const lines = [`**Self-review:** ${v.verdict} · CRITICAL ${v.blocking.length} blocking / ${v.waived.length} waived · WARNING ${v.counts.WARNING} · SUGGESTION ${v.counts.SUGGESTION}`];
  if (v.units) lines.push(`Skills: ${[...new Set(v.units.reviewed.map((u) => u.split(' ')[1]))].join(', ') || '—'}${v.units.skipped.length ? ` (skipped: ${v.units.skipped.join(', ')})` : ''}`);
  for (const w of v.waived) {
    const f = v.findings.find((x) => x.id === w.id);
    lines.push(`- Waived ${w.id} ${f ? `${loc(f)} — ${f.title}` : ''}: ${w.reason}`);
  }
  return lines.join('\n');
}

export function formatConsole(v, mdPath) {
  const byId = new Map(v.findings.map((f) => [f.id, f]));
  const lines = [`pr-self-review verdict: ${v.verdict} · CRITICAL ${v.counts.CRITICAL} (blocking ${v.blocking.length}, waived ${v.waived.length}) · WARNING ${v.counts.WARNING} · SUGGESTION ${v.counts.SUGGESTION}`];
  for (const id of v.blocking) {
    const f = byId.get(id);
    lines.push(`  ⛔ ${id} ${f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '(repo)'} — ${f.title} [${who(f)}]${f.unverified ? ' (not verified)' : ''}`);
  }
  for (const x of v.incomplete) lines.push(`  ⚠ ${x}`);
  if (mdPath) lines.push(`Report: ${mdPath}`);
  return lines.join('\n');
}

// ---------- CLI ----------

function currentPlan(repo, base, fetch, skillsDir) {
  return collect({ repo, base, fetch, map: loadMap(DEFAULT_MAP), skillsDir });
}

export function verdictForRun(run) {
  const plan = readJson(path.join(run, 'plan.json'));
  const checks = readJsonIf(path.join(run, 'checks.json'));
  const unitsJson = readJsonIf(path.join(run, 'units.json'));
  const unitResults = unitsJson ? readUnitResults(run, unitsJson) : null;
  const verifications = readVerifications(run);
  const waivers = readWaivers(plan.repo, plan.diffHash);
  return buildVerdict({ plan, checks, unitsJson, unitResults, verifications, waivers });
}

function writeVerdict(v, repo) {
  const json = verdictPath(repo, v.diffHash);
  const md = verdictPath(repo, v.diffHash, 'md');
  fs.mkdirSync(path.dirname(json), { recursive: true });
  fs.writeFileSync(json, `${JSON.stringify(v, null, 2)}\n`);
  fs.writeFileSync(md, formatMarkdown(v));
  return { json, md };
}

function usage() {
  return `Usage:
  node verdict.mjs [--run <dir>] [--base <ref>] [--no-fetch] [--repo <dir>] [--skills-dir <dir>]
  node verdict.mjs waive <F-id> <reason...> [--base <ref>] [--no-fetch] [--repo <dir>]`;
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] === 'waive' ? argv.shift() : 'verdict';
  const o = { base: 'origin/main', fetch: true, repo: process.cwd(), rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run') o.run = argv[++i];
    else if (a === '--base') o.base = argv[++i];
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--skills-dir') o.skillsDir = argv[++i];
    else if (a === '-h' || a === '--help') { console.log(usage()); return 0; }
    else o.rest.push(a);
  }

  let plan;
  try { plan = currentPlan(o.repo, o.base, o.fetch, o.skillsDir); } catch (e) {
    console.error(`pr-self-review verdict: ${e.message}`);
    return e.code === 'INCOMPLETE_MAP' ? 2 : 1;
  }
  const run = path.resolve(o.run ?? runDir(plan.repo, plan.diffHash));
  const runPlan = readJsonIf(path.join(run, 'plan.json'));
  if (!runPlan) { console.error(`No review run for the current diff (${plan.diffHash.slice(0, 16)}) at ${run} — run the skill from step 1 (collect.mjs).`); return 1; }
  if (runPlan.diffHash !== plan.diffHash) {
    console.error(`The run at ${run} reviewed a different diff (${runPlan.diffHash.slice(0, 16)}); the working tree is now ${plan.diffHash.slice(0, 16)}. Re-run the review.`);
    return 1;
  }

  if (cmd === 'waive') {
    const [id, ...reasonParts] = o.rest;
    const reason = reasonParts.join(' ').trim();
    if (!/^F-[0-9a-f]{8}$/.test(id ?? '') || !reason) { console.error(`waive needs a finding id and a reason\n${usage()}`); return 1; }
    const current = verdictForRun(run);
    if (!current.blocking.includes(id)) {
      console.error(`${id} is not a blocking CRITICAL of the current diff (blocking: ${current.blocking.join(', ') || 'none'}).`);
      return 1;
    }
    const file = waiversPath(plan.repo);
    const all = readJsonIf(file) ?? {};
    // waivers are per diff: drop those of other diffs so stale waivers never come back
    const next = { [plan.diffHash]: [...(all[plan.diffHash] ?? []).filter((w) => w.id !== id), { id, reason, at: new Date().toISOString() }] };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Waived ${id}: ${reason}`);
  } else if (o.rest.length) { console.error(`unknown argument ${o.rest[0]}\n${usage()}`); return 1; }

  const v = verdictForRun(run);
  const { md } = writeVerdict(v, plan.repo);
  console.log(formatConsole(v, md));
  return v.verdict === 'PASS' ? 0 : v.verdict === 'BLOCK' ? 3 : 4;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
