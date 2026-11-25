#!/usr/bin/env node
// pr-self-review — CI entry point (level 3, decision D1: deterministic only, no LLM).
// Runs in .github/workflows/pr-self-review.yml on every pull request:
//   1. collect the PR diff against the base branch (same code as the local skill),
//   2. run the repo rules from checks.mjs (contract drift, package-manager mix, lockfile sync,
//      secrets, English-only) — lint/typecheck/tests run in the package suites the workflow calls,
//   3. write `<package>=true|false` to $GITHUB_OUTPUT so the workflow calls only the touched suites,
//   4. annotate findings (::error / ::warning) and write a job summary.
// Exit 1 when a rule finds a CRITICAL. Outputs are written before that, so the suites still run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, loadMap, DEFAULT_MAP } from './collect.mjs';
import { runChecks, packagesToGate, PACKAGE_GATES } from './checks.mjs';

const esc = (s) => String(s ?? '').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function annotation(f) {
  const level = f.severity === 'CRITICAL' ? 'error' : f.severity === 'WARNING' ? 'warning' : 'notice';
  const props = [f.file && `file=${escProp(f.file)}`, f.line && `line=${f.line}`, `title=${escProp(`${f.severity} ${f.rule}`)}`]
    .filter(Boolean).join(',');
  return `::${level} ${props}::${esc(`${f.title}${f.fix ? `\nFix: ${f.fix}` : ''}`)}`;
}

export function summary(plan, report, packages) {
  const lines = ['## PR self-review (deterministic)', ''];
  lines.push(`Diff vs \`${plan.base.ref}\`: ${plan.summary.files} files (+${plan.summary.additions} −${plan.summary.deletions}) · suites to run: ${packages.join(', ') || 'none'}`, '');
  lines.push('| Rule | Result |', '|---|---|');
  for (const r of report.results) lines.push(`| ${r.name} | ${r.status}${r.reason ? ` — ${r.reason}` : ''} |`);
  lines.push('');
  if (report.findings.length) {
    lines.push('| Severity | Where | Finding |', '|---|---|---|');
    for (const f of report.findings) {
      lines.push(`| ${f.severity} | ${f.file ? `\`${f.file}${f.line ? `:${f.line}` : ''}\`` : '—'} | ${String(f.title).replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  lines.push(`**${report.counts.CRITICAL ? 'FAIL' : 'PASS'}** · CRITICAL ${report.counts.CRITICAL} · WARNING ${report.counts.WARNING}`);
  lines.push('', '_LLM skill review runs locally before the PR (`/pr-self-review`); CI checks only deterministic rules._');
  return `${lines.join('\n')}\n`;
}

function main() {
  const argv = process.argv.slice(2);
  const o = { base: process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main', repo: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') o.base = argv[++i];
    else if (argv[i] === '--repo') o.repo = argv[++i];
    else { console.error(`unknown argument ${argv[i]}\nUsage: node ci.mjs [--base <ref>] [--repo <dir>]`); return 2; }
  }

  let plan;
  try {
    plan = collect({ repo: o.repo, base: o.base, fetch: false, map: loadMap(DEFAULT_MAP) });
  } catch (e) {
    console.log(`::error title=pr-self-review::${esc(e.message)}`);
    return 1;
  }
  const report = runChecks({ plan, skipGates: true });
  const packages = plan.empty ? [] : packagesToGate(plan);

  const outputs = Object.keys(PACKAGE_GATES).map((p) => `${p}=${packages.includes(p)}`);
  outputs.push(`diff_hash=${plan.diffHash}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
  else console.log(outputs.join('\n'));

  for (const f of report.findings) console.log(annotation(f));
  const md = summary(plan, report, packages);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  else console.log(md);

  return report.counts.CRITICAL ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
