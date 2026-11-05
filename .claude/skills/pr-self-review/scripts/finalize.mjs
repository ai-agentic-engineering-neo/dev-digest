#!/usr/bin/env node
/**
 * Final steps of pr-self-review.
 *
 *   node finalize.mjs merge     # after all skill agents + checks.mjs: normalize, mark pre-existing,
 *                               # dedupe → run/merged.json; prints the criticals that need verification
 *   node finalize.mjs verdict   # after verifier agents: apply verification + waivers → verdict,
 *                               # last-run.json, pr-summary.md, cache. Exit 0 = PASS, 1 = BLOCK.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_DIR, LAST_RUN_FILE, ROOT, RUN_DIR, SEVERITIES, SUMMARY_FILE, WAIVERS_FILE, inRanges, readJson,
  sevRank, toPosix, writeJson,
} from './lib.mjs';

const cmd = process.argv[2];
const plan = readJson(join(RUN_DIR, 'plan.json'));
if (!plan) {
  console.error('run/plan.json not found — run collect-diff.mjs first');
  process.exit(2);
}
const fileInfo = new Map(plan.files.map((f) => [f.path, f]));

const words = (s = '') => new Set(s.toLowerCase().split(/[^a-zа-яіїєґ0-9_]+/i).filter((w) => w.length > 3));
const similar = (a, b) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size) >= 0.5;
};

function normalize(raw, task) {
  const file = toPosix(String(raw.file ?? '')).replace(/^\.\//, '');
  const line = Number.isInteger(raw.line) && raw.line > 0 ? raw.line : null;
  const info = fileInfo.get(file);
  const severity = SEVERITIES.includes(String(raw.severity).toLowerCase()) ? String(raw.severity).toLowerCase() : 'medium';
  const onChangedLine = info && line ? inRanges(line, info.changedLines) : raw.onChangedLine !== false;
  return {
    source: 'llm',
    skill: raw.skill || task?.skill,
    rule: String(raw.rule || `${task?.skill ?? 'unknown'}/unspecified`),
    file,
    line,
    severity,
    issue: String(raw.issue ?? ''),
    evidence: String(raw.evidence ?? ''),
    fix: String(raw.fix ?? ''),
    onChangedLine,
    verified: raw.verified === true,
    downgraded: raw.downgraded ?? null,
    taskId: task?.id ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------------------------
function merge() {
  const warnings = [...plan.warnings];
  const raw = [];
  const incomplete = [];

  for (const task of plan.tasks) {
    const out = join(ROOT, task.outputPath);
    if (!existsSync(out)) {
      incomplete.push(task.id);
      continue;
    }
    let data;
    try {
      data = readJson(out);
    } catch (e) {
      incomplete.push(task.id);
      warnings.push(`task ${task.id}: invalid JSON in ${task.outputPath} (${e.message})`);
      continue;
    }
    const list = Array.isArray(data) ? data : data.findings ?? [];
    for (const r of list) {
      const n = normalize(r, task);
      if (!task.files.includes(n.file)) {
        warnings.push(`task ${task.id}: finding for ${n.file || '(no file)'} is outside its files — dropped`);
        continue;
      }
      n.cacheKey = task.cacheKeys[n.file];
      raw.push(n);
    }
  }
  for (const c of plan.cached) {
    for (const r of c.findings) raw.push({ ...normalize(r, { skill: c.skill, id: null }), fromCache: true, cacheKey: c.cacheKey });
  }
  raw.forEach((r, i) => (r.rawId = i));

  // dedupe LLM/cached findings (same file, line ±2, same rule or similar issue)
  const groups = [];
  const sorted = [...raw].sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  for (const r of sorted) {
    const g = groups.find(
      (x) =>
        x.file === r.file &&
        ((x.line === null && r.line === null) || (x.line !== null && r.line !== null && Math.abs(x.line - r.line) <= 2)) &&
        (x.rules.includes(r.rule) || similar(x.issue, r.issue)),
    );
    if (!g) {
      groups.push({ ...r, skills: [r.skill], rules: [r.rule], members: [r.rawId] });
      continue;
    }
    g.members.push(r.rawId);
    if (!g.skills.includes(r.skill)) g.skills.push(r.skill);
    if (!g.rules.includes(r.rule)) g.rules.push(r.rule);
    g.onChangedLine ||= r.onChangedLine;
    if (sevRank(r.severity) < sevRank(g.severity)) Object.assign(g, { severity: r.severity, rule: r.rule, issue: r.issue, fix: r.fix, evidence: r.evidence, verified: r.verified });
    else g.verified &&= r.verified || sevRank(r.severity) > sevRank(g.severity);
  }

  const checks = readJson(join(RUN_DIR, 'checks.json'));
  if (!checks) warnings.push('run/checks.json missing — deterministic checks did not run');
  for (const w of checks?.warnings ?? []) warnings.push(w);
  const deterministic = (checks?.findings ?? []).map((f) => ({ ...f, skills: [f.skill], rules: [f.rule], members: [], verified: true }));

  const findings = [...deterministic, ...groups].map((f, i) => ({
    id: `F${i + 1}`,
    ...f,
    status: f.onChangedLine ? 'new' : 'pre-existing',
  }));
  const needsVerification = findings
    .filter((f) => f.source === 'llm' && f.severity === 'critical' && f.status === 'new' && !f.verified)
    .map((f) => f.id);

  writeJson(join(RUN_DIR, 'merged.json'), { findings, raw, needsVerification, incomplete, warnings, checksRan: checks?.ran ?? [] });

  console.log(`merged: ${findings.length} findings (${raw.length} raw from skills, ${deterministic.length} deterministic)`);
  if (incomplete.length) console.log(`INCOMPLETE tasks (no output): ${incomplete.join(', ')}`);
  if (!needsVerification.length) console.log('verification: none needed');
  else {
    console.log(`verification needed for ${needsVerification.length} critical finding(s) → write run/verify/<id>.json:`);
    for (const id of needsVerification) {
      const f = findings.find((x) => x.id === id);
      console.log(`  ${id} · ${f.file}:${f.line ?? '?'} · ${f.rules.join(', ')} · ${f.issue}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// verdict
// ---------------------------------------------------------------------------------------------
const NON_WAIVABLE_SECURITY = /secret|credential|token|password|api[-_]?key|private[-_]?key/i;

function loadWaivers(warnings) {
  if (!existsSync(WAIVERS_FILE)) return [];
  let list;
  try {
    list = readJson(WAIVERS_FILE, []);
  } catch (e) {
    warnings.push(`waivers.json is not valid JSON (${e.message}) — no waivers applied`);
    return [];
  }
  const today = new Date().toISOString().slice(0, 10);
  return (Array.isArray(list) ? list : []).filter((w, i) => {
    const tag = `waiver #${i + 1} (${w.file ?? '?'} · ${w.rule ?? '?'})`;
    if (!w.file || !w.rule || !w.reason || !w.expires) {
      warnings.push(`${tag}: file, rule, reason and expires are required — ignored`);
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.expires)) {
      warnings.push(`${tag}: expires must be YYYY-MM-DD — ignored`);
      return false;
    }
    if (w.expires < today) {
      warnings.push(`${tag}: expired on ${w.expires} — ignored`);
      return false;
    }
    return true;
  });
}

const isWaivable = (f) =>
  f.waivable !== false && !(f.skills?.includes('security') && f.rules?.some((r) => NON_WAIVABLE_SECURITY.test(r)));

function verdict() {
  const merged = readJson(join(RUN_DIR, 'merged.json'));
  if (!merged) {
    console.error('run/merged.json not found — run `finalize.mjs merge` first');
    process.exit(2);
  }
  const { findings, raw, incomplete } = merged;
  const warnings = [...merged.warnings];

  // 1. verification
  for (const id of merged.needsVerification) {
    const f = findings.find((x) => x.id === id);
    const v = readJson(join(RUN_DIR, 'verify', `${id}.json`));
    if (!v) {
      warnings.push(`${id} was not verified — kept as critical`);
      continue;
    }
    if (v.confirmed === true) f.verified = true;
    else {
      f.severity = 'high';
      f.downgraded = `verifier: ${v.reason ?? 'not reproduced'}`;
    }
    if (v.onChangedLine === false) {
      f.status = 'pre-existing';
      f.downgraded ??= `verifier: not on a changed line`;
    }
  }

  // 2. waivers
  const waivers = loadWaivers(warnings);
  for (const f of findings) {
    const w = waivers.find(
      (x) => x.file === f.file && f.rules.includes(x.rule) && (x.line == null || f.line == null || Math.abs(x.line - f.line) <= 5),
    );
    if (!w) continue;
    if (!isWaivable(f)) {
      warnings.push(`waiver for ${f.file} · ${w.rule} ignored — this finding cannot be waived`);
      continue;
    }
    f.waived = { reason: w.reason, expires: w.expires };
  }

  // 3. verdict
  const blocking = findings.filter((f) => f.severity === 'critical' && f.status === 'new' && !f.waived);
  const count = (sev) => findings.filter((f) => f.severity === sev && f.status === 'new' && !f.waived).length;
  const waived = findings.filter((f) => f.waived);
  const verdictValue = blocking.length || incomplete.length ? 'BLOCK' : 'PASS';
  if (incomplete.length) warnings.push(`review incomplete — no output from: ${incomplete.join(', ')} (BLOCK until rerun)`);

  const skillsRun = [...new Set([...plan.tasks.map((t) => t.skill), ...plan.cached.map((c) => c.skill)])].sort();
  const filesReviewed = plan.files.filter((f) => f.skills.length).length;
  const result = {
    verdict: verdictValue,
    criticalCount: blocking.length,
    waivedCount: waived.length,
    counts: { critical: blocking.length, high: count('high'), medium: count('medium'), low: count('low') },
    head: plan.head,
    baseRef: plan.baseRef,
    mergeBase: plan.mergeBase,
    diffHash: plan.diffHash,
    timestamp: new Date().toISOString(),
    skillsRun,
    checksRan: merged.checksRan,
    filesReviewed,
    incomplete,
    findings,
    warnings,
  };
  writeJson(LAST_RUN_FILE, result);

  // 4. cache (completed tasks only; stores post-verification severity)
  const byGroup = new Map();
  for (const f of findings) for (const m of f.members ?? []) byGroup.set(m, f);
  for (const task of plan.tasks) {
    if (incomplete.includes(task.id)) continue;
    for (const file of task.files) {
      const entries = raw
        .filter((r) => r.taskId === task.id && r.file === file)
        .map((r) => {
          const g = byGroup.get(r.rawId);
          const out = { skill: r.skill, rule: r.rule, file: r.file, line: r.line, severity: r.severity, issue: r.issue, evidence: r.evidence, fix: r.fix, onChangedLine: r.onChangedLine };
          if (g && r.severity === 'critical') {
            if (g.downgraded) Object.assign(out, { severity: 'high', downgraded: g.downgraded });
            else if (g.verified) out.verified = true;
          }
          return out;
        });
      writeJson(join(CACHE_DIR, task.skill, `${task.cacheKeys[file]}.json`), { skill: task.skill, file, createdAt: result.timestamp, findings: entries });
    }
  }

  // 5. PR summary + terminal report
  writeFileSync(SUMMARY_FILE, prSummary(result));
  printReport(result);
  process.exit(verdictValue === 'PASS' ? 0 : 1);
}

const loc = (f) => `${f.file}${f.line ? `:${f.line}` : ''}`;
const fmt = (f) => `${loc(f)} · ${f.skills.join('+')} · ${f.rules.join(', ')} · ${f.issue}${f.fix ? `\n      fix: ${f.fix}` : ''}${f.downgraded ? `\n      (${f.downgraded})` : ''}`;

function printReport(r) {
  const live = r.findings.filter((f) => f.status === 'new' && !f.waived);
  const section = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length})`);
    for (const f of list) console.log(`  ${f.id} ${fmt(f)}`);
  };
  console.log(`\n════ pr-self-review: ${r.verdict} ════`);
  console.log(`critical ${r.counts.critical} · high ${r.counts.high} · medium ${r.counts.medium} · low ${r.counts.low} · waived ${r.waivedCount}`);
  section('CRITICAL — blocks the PR', live.filter((f) => f.severity === 'critical'));
  section('WAIVED', r.findings.filter((f) => f.waived).map((f) => ({ ...f, issue: `${f.issue} [waiver: ${f.waived.reason}, until ${f.waived.expires}]` })));
  section('HIGH', live.filter((f) => f.severity === 'high'));
  section('MEDIUM / LOW', live.filter((f) => f.severity === 'medium' || f.severity === 'low'));
  section('PRE-EXISTING (not blocking)', r.findings.filter((f) => f.status === 'pre-existing'));
  if (r.warnings.length) {
    console.log(`\nWARNINGS (${r.warnings.length})`);
    for (const w of r.warnings) console.log(`  - ${w}`);
  }
  const rows = new Map();
  for (const t of plan.tasks) rows.set(t.skill, { files: (rows.get(t.skill)?.files ?? 0) + t.files.length, cached: rows.get(t.skill)?.cached ?? 0 });
  for (const c of plan.cached) rows.set(c.skill, { files: (rows.get(c.skill)?.files ?? 0) + 1, cached: (rows.get(c.skill)?.cached ?? 0) + 1 });
  if (rows.size) {
    console.log('\nskill                       files  cached  findings');
    for (const [s, v] of [...rows].sort()) {
      const n = r.findings.filter((f) => f.skills.includes(s)).length;
      console.log(`  ${s.padEnd(26)} ${String(v.files).padStart(5)} ${String(v.cached).padStart(7)} ${String(n).padStart(9)}`);
    }
  }
  console.log(`checks: ${r.checksRan.join(', ') || 'none'}`);
  const waivable = live.filter((f) => f.severity === 'critical' && isWaivable(f));
  if (waivable.length) {
    console.log('\nIf a critical is a false positive, the user may add a waiver to .claude/pr-self-review/waivers.json:');
    console.log(JSON.stringify(waivable.map((f) => ({ file: f.file, rule: f.rules[0], line: f.line ?? undefined, reason: '<why this is safe>', expires: '<YYYY-MM-DD>' })), null, 2));
  }
  console.log(`\nresult: .claude/pr-self-review/last-run.json · PR text: .claude/pr-self-review/pr-summary.md`);
}

function prSummary(r) {
  const list = (items) => items.map((f) => `- \`${loc(f)}\` · ${f.rules.join(', ')} — ${f.issue}`).join('\n');
  const high = r.findings.filter((f) => f.severity === 'high' && f.status === 'new' && !f.waived);
  const crit = r.findings.filter((f) => f.severity === 'critical' && f.status === 'new' && !f.waived);
  const waived = r.findings.filter((f) => f.waived);
  const out = [
    `### Self-review: ${r.verdict}`,
    '',
    `Skills: ${r.skillsRun.join(', ') || 'none'} (${r.filesReviewed} files) · checks: ${r.checksRan.join(', ') || 'none'}`,
    `Critical: ${r.counts.critical} · High: ${r.counts.high} · Medium: ${r.counts.medium} · Low: ${r.counts.low} · Waived: ${r.waivedCount}`,
    `Diff \`${r.diffHash.slice(0, 12)}\` vs \`${r.baseRef}\` (${r.mergeBase.slice(0, 8)}) · ${r.timestamp.slice(0, 16).replace('T', ' ')} UTC`,
  ];
  if (crit.length) out.push('', '<details><summary>Critical findings</summary>', '', list(crit), '', '</details>');
  if (high.length) out.push('', '<details><summary>High findings</summary>', '', list(high), '', '</details>');
  if (waived.length) {
    out.push('', '<details><summary>Waivers</summary>', '');
    for (const f of waived) out.push(`- \`${loc(f)}\` · ${f.rules.join(', ')} · ${f.waived.reason} · expires ${f.waived.expires}`);
    out.push('', '</details>');
  }
  return `${out.join('\n')}\n`;
}

if (cmd === 'merge') merge();
else if (cmd === 'verdict') verdict();
else {
  console.error('usage: finalize.mjs merge | verdict');
  process.exit(2);
}
