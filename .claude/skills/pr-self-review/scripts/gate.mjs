#!/usr/bin/env node
// Verdict + gate.
//   merge            normalize static + agent findings → run/merged.json, list criticals to verify
//   record           apply run/verify.json → verdict → last-run.json, run/report.md, cache
//   check [--soft]   strict: last run must match the current diff and PASS (exit 2 otherwise)
//                    --soft (pre-push): block only on a known BLOCKED verdict for this exact diff
//   check --hook     PreToolUse hook: reads the tool call from stdin, gates `gh pr create` / `gh pr merge`
//   publish-status   set the `pr-self-review` commit status on HEAD (for a required GitHub check)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_FILE, LAST_RUN, REPO_ROOT, RUN_DIR, STATUS_CONTEXT, computeDiffHash, git, inRanges,
  parseArgs, readJson, readRepoFile, sha256, writeJson,
} from './lib.mjs';

const RANK = { critical: 0, major: 1, minor: 2, nit: 3 };
const MIN_CRITICAL_CONFIDENCE = 0.7;
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

const fail = (msg, code = 2) => {
  process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n');
  process.exit(code);
};

function loadPlan() {
  const plan = readJson(join(RUN_DIR, 'plan.json'));
  if (!plan) fail('run/plan.json missing — run collect.mjs first.', 1);
  return plan;
}

// ---------- merge ----------

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function suppression(f) {
  if (!f.line) return null;
  const text = readRepoFile(f.file);
  if (!text) return null;
  const lines = text.split('\n');
  for (const l of [lines[f.line - 1], lines[f.line - 2]]) {
    const m = l?.match(/pr-self-review-ignore\s+([\w/.-]+)\s*:\s*(\S.*?)\s*(?:\*\/|-->)?\s*$/);
    // Full id ("static/route-db-access") or the bare rule ("route-db-access") — the latter covers every source.
    if (m && (m[1] === f.rule || m[1] === f.rule.split('/').pop())) return m[2];
  }
  return null;
}

function normalize(raw, group, plan) {
  const severity = String(raw.severity ?? '').toLowerCase();
  const f = {
    source: raw.source ?? 'skill',
    skill: raw.skill ?? group?.skill ?? 'unknown',
    rule: raw.rule ?? 'unspecified',
    severity: severity in RANK ? severity : 'minor',
    file: String(raw.file ?? '').replace(/^\.\//, ''),
    line: Number(raw.line) || 0,
    endLine: Number(raw.endLine) || undefined,
    summary: raw.summary ?? '',
    fix: raw.fix ?? '',
    evidence: raw.evidence ?? '',
    confidence: raw.confidence === undefined ? (raw.source === 'static' ? 1 : 0.5) : Number(raw.confidence),
    introduced: raw.introduced,
    cached: raw.cached ?? false,
    notes: [],
  };
  if (f.source === 'skill' && !f.rule.startsWith(`${f.skill}/`)) f.rule = `${f.skill}/${f.rule}`;

  const entry = plan.files.find((x) => x.path === f.file);
  if (f.introduced === undefined) {
    if (!entry) f.introduced = false;
    else if (entry.status === 'A' && !entry.from) f.introduced = true;
    else f.introduced = f.line > 0 && inRanges(f.line, entry.added, f.endLine ?? f.line);
  }

  // Criticals from a model must carry proof that exists in the file, or they don't block.
  if (f.source === 'skill' && f.severity === 'critical') {
    const text = readRepoFile(f.file) ?? '';
    if (!f.evidence) f.notes.push('downgraded: no evidence quoted');
    else if (!norm(text).includes(norm(f.evidence))) f.notes.push('downgraded: evidence not found in file');
    else if (!(f.confidence >= MIN_CRITICAL_CONFIDENCE)) f.notes.push(`downgraded: confidence ${f.confidence} < ${MIN_CRITICAL_CONFIDENCE}`);
    if (f.notes.length) f.severity = 'major';
  }

  const reason = suppression(f);
  if (reason) f.suppressed = reason;
  f.id = 'F' + sha256(`${f.file}:${f.line}:${f.rule}`).slice(0, 6);
  return f;
}

function cmdMerge() {
  const plan = loadPlan();
  const stat = readJson(join(RUN_DIR, 'static.json'));
  if (!stat) fail('run/static.json missing — run static-checks.mjs first.', 1);

  const all = stat.findings.map((r) => normalize(r, null, plan));
  // Fail fast: a blocking static finding makes agent review pointless — skipped groups aren't "incomplete".
  const staticBlocks = all.some((f) => f.severity === 'critical' && f.introduced && !f.suppressed);
  if (args['skip-agents'] && !staticBlocks) fail('--skip-agents is only allowed when static checks already block.', 1);
  const skipAgents = Boolean(args['skip-agents']);
  const incomplete = [];
  for (const g of plan.groups) {
    const out = readJson(join(REPO_ROOT, g.output));
    if (!out) { if (!skipAgents) incomplete.push(g.id); continue; }
    const list = Array.isArray(out) ? out : out.findings ?? [];
    for (const r of list) all.push(normalize({ ...r, source: 'skill' }, g, plan));
  }
  for (const c of plan.cached) for (const r of c.findings) all.push(normalize({ ...r, cached: true }, { skill: c.skill }, plan));

  // Same spot reported by several skills → one finding, highest severity wins.
  const byKey = new Map();
  // Unsuppressed first, so a suppression of one rule never hides another rule's finding on that line.
  for (const f of all.sort((a, b) => RANK[a.severity] - RANK[b.severity] || Boolean(a.suppressed) - Boolean(b.suppressed))) {
    const key = f.line ? `${f.file}:${f.line}` : `${f.file}:${f.rule}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...f, alsoFlaggedBy: [] });
    else if (prev.skill !== f.skill && !prev.alsoFlaggedBy.includes(f.skill)) prev.alsoFlaggedBy.push(f.skill);
  }
  const findings = [...byKey.values()];
  const toVerify = findings.filter((f) => f.source === 'skill' && !f.cached && f.severity === 'critical' && f.introduced && !f.suppressed);
  writeJson(join(RUN_DIR, 'merged.json'), { incomplete, skipAgents, findings, toVerify: toVerify.map((f) => f.id) });

  console.log(`merged ${findings.length} finding(s); incomplete groups: ${incomplete.join(', ') || 'none'}`);
  if (toVerify.length) {
    console.log('critical findings to verify (write run/verify.json):');
    for (const f of toVerify) console.log(`  ${f.id}  ${f.rule}  ${f.file}:${f.line} — ${f.summary}`);
  } else console.log('no model critical findings to verify — run `gate.mjs record`.');
}

// ---------- record ----------

function cmdRecord() {
  const plan = loadPlan();
  const merged = readJson(join(RUN_DIR, 'merged.json'));
  if (!merged) fail('run/merged.json missing — run `gate.mjs merge` first.', 1);
  if (computeDiffHash(plan.mergeBase) !== plan.diffHash)
    fail('Files changed during the review — results are stale. Rerun from collect.mjs.', 1);

  const verify = readJson(join(RUN_DIR, 'verify.json'), {});
  const unverified = [];
  const findings = [];
  for (const f of merged.findings) {
    const v = verify[f.id];
    if (merged.toVerify.includes(f.id)) {
      if (!v) unverified.push(f.id);
      else if (v.verdict === 'rejected') continue;
      else if (v.verdict === 'downgrade') {
        f.severity = v.severity in RANK && v.severity !== 'critical' ? v.severity : 'major';
        f.notes.push(`downgraded on verification: ${v.note ?? ''}`.trim());
      } else f.notes.push('verified');
    }
    findings.push(f);
  }

  const blocking = findings.filter((f) => f.severity === 'critical' && f.introduced && !f.suppressed);
  const introduced = findings.filter((f) => f.introduced && !f.suppressed);
  const counts = Object.fromEntries(Object.keys(RANK).map((s) => [s, introduced.filter((f) => f.severity === s).length]));
  const verdict = merged.incomplete.length ? 'INCOMPLETE' : blocking.length ? 'BLOCKED' : 'PASS';

  // Cache verified per-(skill, file) results so a rerun only reviews what changed.
  const cache = readJson(CACHE_FILE, { entries: {} });
  for (const g of plan.groups) {
    if (merged.incomplete.includes(g.id) || !existsSync(join(REPO_ROOT, g.output))) continue;
    for (const [file, key] of Object.entries(g.cacheKeys)) {
      cache.entries[key] = findings
        .filter((f) => f.file === file && (f.skill === g.skill || f.alsoFlaggedBy.includes(g.skill)))
        .map(({ id, notes, cached, introduced, suppressed, alsoFlaggedBy, ...rest }) => ({ ...rest, skill: g.skill, source: 'skill' }));
    }
  }
  const keys = Object.keys(cache.entries);
  for (const k of keys.slice(0, Math.max(0, keys.length - 3000))) delete cache.entries[k];
  writeJson(CACHE_FILE, cache);

  const stat = readJson(join(RUN_DIR, 'static.json'));
  const report = renderReport({ plan, verdict, counts, blocking, findings, incomplete: merged.incomplete, skipAgents: merged.skipAgents, unverified, notes: stat.notes });
  writeFileSync(join(RUN_DIR, 'report.md'), report);
  writeJson(LAST_RUN, {
    verdict,
    diffHash: plan.diffHash,
    base: plan.base,
    mergeBase: plan.mergeBase,
    head: plan.head,
    branch: plan.branch,
    mode: plan.mode,
    counts,
    blocking: blocking.map((f) => ({ id: f.id, rule: f.rule, file: f.file, line: f.line, summary: f.summary })),
    recordedAt: new Date().toISOString(),
    report: '.claude/pr-self-review/run/report.md',
  });
  console.log(report);
}

function renderReport({ plan, verdict, counts, blocking, findings, incomplete, skipAgents, unverified, notes }) {
  const row = (f) =>
    `| ${f.id} | ${f.severity} | \`${f.file}${f.line ? `:${f.line}` : ''}\` | ${f.rule}${f.alsoFlaggedBy.length ? ` (+${f.alsoFlaggedBy.join(', ')})` : ''} | ${f.summary.replace(/\|/g, '\\|')}${f.notes.length ? ` _(${f.notes.join('; ')})_` : ''} | ${f.fix.replace(/\|/g, '\\|')} |`;
  const table = (list) => ['| ID | Sev | Where | Rule | Problem | Fix |', '|---|---|---|---|---|---|', ...list.map(row)].join('\n');
  const introduced = findings.filter((f) => f.introduced && !f.suppressed && f.severity !== 'critical');
  const legacy = findings.filter((f) => !f.introduced && !f.suppressed);
  const suppressed = findings.filter((f) => f.suppressed);
  const out = [
    `# PR self-review — ${verdict}`,
    '',
    `\`${plan.branch}\` vs \`${plan.base}\` · mode **${plan.mode}** · ${plan.totals.files} files (+${plan.totals.linesAdded} −${plan.totals.linesDeleted})`,
    `Introduced: ${counts.critical} critical · ${counts.major} major · ${counts.minor} minor · ${counts.nit} nit`,
    '',
  ];
  if (verdict === 'BLOCKED') out.push('**Do not open or merge this PR.** Fix the critical findings below and rerun `/pr-self-review`.', '');
  if (verdict === 'INCOMPLETE') out.push(`**Review incomplete** — no result from agent group(s): ${incomplete.join(', ')}. Rerun them.`, '');
  if (skipAgents) out.push('> Skill agents were skipped because static checks already block. Fix those, then rerun for the full review.', '');
  if (plan.warnings.length) out.push('## Warnings', ...plan.warnings.map((w) => `- ${w}`), '');
  if (notes?.length) out.push('## Checks', ...notes.map((n) => `- ${n}`), '');
  if (unverified.length) out.push(`> Unverified critical findings counted as critical: ${unverified.join(', ')}`, '');
  if (blocking.length) out.push('## Critical (blocking)', table(blocking), '');
  if (introduced.length) out.push('## Other findings in your changes', table(introduced), '');
  if (legacy.length)
    out.push(`## Pre-existing in touched files (not blocking) — ${legacy.length}`, table(legacy.slice(0, 20)), '');
  if (suppressed.length) out.push('## Suppressed', ...suppressed.map((f) => `- ${f.id} \`${f.file}:${f.line}\` ${f.rule} — ${f.suppressed}`), '');
  return out.join('\n');
}

// ---------- check ----------

function strictCheck() {
  const last = readJson(LAST_RUN);
  if (!last) return 'No pr-self-review result for this branch. Run /pr-self-review first.';
  const now = computeDiffHash(last.mergeBase);
  if (now !== last.diffHash) return `Changes since the last pr-self-review (${last.recordedAt}). Rerun /pr-self-review.`;
  if (last.verdict !== 'PASS') {
    const list = last.blocking.map((b) => `  - ${b.file}:${b.line} ${b.rule} — ${b.summary}`).join('\n');
    return `pr-self-review verdict is ${last.verdict}. Fix and rerun /pr-self-review.\n${list}\nReport: ${last.report}`;
  }
  return null;
}

function softCheck() {
  const last = readJson(LAST_RUN);
  if (!last) return { warn: 'pr-self-review has not been run on this branch.' };
  if (computeDiffHash(last.mergeBase) !== last.diffHash) return { warn: 'pr-self-review result is stale (changes since last run).' };
  if (last.verdict !== 'PASS') return { block: `pr-self-review verdict for exactly these changes is ${last.verdict}. See ${last.report}` };
  return {};
}

function prMergeCheck(command) {
  const after = command.split(/\bgh\s+pr\s+merge\b/)[1] ?? '';
  const target = after.trim().split(/\s+/).find((t) => t && !t.startsWith('-') && !/^[|;&]/.test(t));
  try {
    const out = execFileSync('gh', ['pr', 'view', ...(target ? [target] : []), '--json', 'number,statusCheckRollup'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pr = JSON.parse(out);
    const status = (pr.statusCheckRollup ?? []).find((c) => c.context === STATUS_CONTEXT);
    if (!status) return `PR #${pr.number} has no "${STATUS_CONTEXT}" status. Run /pr-self-review on its branch and publish the status.`;
    if (status.state !== 'SUCCESS') return `PR #${pr.number}: "${STATUS_CONTEXT}" is ${status.state}. Merging is blocked until critical findings are fixed.`;
    return null;
  } catch (e) {
    return `Could not read the "${STATUS_CONTEXT}" status of the PR (${String(e.stderr || e.message).trim().split('\n')[0]}). Merge blocked.`;
  }
}

function cmdCheck() {
  if (args.hook) {
    let input = {};
    try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
    const command = input?.tool_input?.command ?? '';
    // `gh` in command position: line start or after ; & | ( $( — optionally behind VAR=value prefixes.
    const ghPr = (sub) => new RegExp(String.raw`(?:^|[;&|(\n]|\$\()\s*(?:\w+=\S*\s+)*gh\s+pr\s+${sub}\b`).test(command);
    if (ghPr('create')) {
      const msg = strictCheck();
      if (msg) fail(`BLOCKED by pr-self-review: ${msg}`);
    } else if (ghPr('merge')) {
      const msg = prMergeCheck(command);
      if (msg) fail(`BLOCKED by pr-self-review: ${msg}`);
    }
    process.exit(0);
  }
  if (args.soft) {
    const r = softCheck();
    if (r.block) fail(`pre-push blocked: ${r.block}\n(bypass deliberately with git push --no-verify)`, 1);
    if (r.warn) process.stderr.write(`pr-self-review: ${r.warn} Run /pr-self-review before opening the PR.\n`);
    process.exit(0);
  }
  const msg = strictCheck();
  if (msg) fail(msg);
  console.log('pr-self-review: PASS for the current diff.');
}

// ---------- publish-status ----------

function cmdPublishStatus() {
  const msg = strictCheck();
  const last = readJson(LAST_RUN);
  if (!last) fail('No pr-self-review result to publish.', 1);
  if (msg && !/verdict is/.test(msg)) fail(msg, 1);
  if (git(['status', '--porcelain']).trim())
    fail('Working tree has uncommitted changes — the verdict would not describe HEAD. Commit first, then rerun.', 1);
  const head = git(['rev-parse', 'HEAD']).trim();
  const url = git(['remote', 'get-url', args.remote ?? 'origin']).trim();
  const repo = url.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];
  if (!repo) fail(`Cannot parse a GitHub repo from ${url}.`, 1);
  const pass = last.verdict === 'PASS';
  const description = pass
    ? `No critical findings (${last.counts.major} major, ${last.mode})`
    : `${last.blocking.length} critical finding(s) — ${last.verdict}`;
  execFileSync('gh', ['api', '-X', 'POST', `repos/${repo}/statuses/${head}`,
    '-f', `state=${pass ? 'success' : 'failure'}`, '-f', `context=${STATUS_CONTEXT}`, '-f', `description=${description.slice(0, 140)}`],
  { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`Published ${STATUS_CONTEXT}=${pass ? 'success' : 'failure'} on ${repo}@${head.slice(0, 8)}`);
}

const commands = { merge: cmdMerge, record: cmdRecord, check: cmdCheck, 'publish-status': cmdPublishStatus };
if (!commands[cmd]) fail('usage: gate.mjs <merge|record|check [--soft|--hook]|publish-status [--remote origin]>', 1);
commands[cmd]();
