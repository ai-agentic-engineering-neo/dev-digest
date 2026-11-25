#!/usr/bin/env node
// pr-self-review — step 4/6 plumbing between the deterministic scripts and the LLM reviewers.
//   node units.mjs --run <dir>            build review units from plan.json, write units.json,
//                                         units/<id>.diff and units/<id>.prompt.md (reviewer prompts)
//   node units.mjs criticals --run <dir>  read units/*.findings.json, write verify/<id>.prompt.md for
//                                         every CRITICAL that needs the verifier, print the list
// The orchestrating agent only spawns subagents with "Read and follow <prompt path>".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMap, DEFAULT_MAP } from './collect.mjs';
import { readUnitResults } from './findings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');

export const DEFAULT_CAP = 8; // reviewer agents per run (project guideline: < 10 agents)
export const DEFAULT_MAX_LINES = 1500; // changed lines per unit

/**
 * Split each (skill → files) group into units of ≤ maxLines changed lines, order by skill priority,
 * keep the first `cap`. A single file larger than maxLines is its own unit.
 */
export function buildUnits(plan, { cap = DEFAULT_CAP, maxLines = DEFAULT_MAX_LINES } = {}) {
  const byPath = new Map(plan.files.map((f) => [f.path, f]));
  const all = [];
  for (const group of plan.units) {
    let chunk = [];
    let lines = 0;
    const flush = () => {
      if (chunk.length) all.push({ ...group, files: chunk, changedLines: lines });
      chunk = []; lines = 0;
    };
    for (const p of [...group.files].sort()) {
      const f = byPath.get(p);
      const n = (f?.additions ?? 0) + (f?.deletions ?? 0);
      if (chunk.length && lines + n > maxLines) flush();
      chunk.push(p); lines += n;
    }
    flush();
  }
  const ordered = all.sort((a, b) => a.priority - b.priority || a.skill.localeCompare(b.skill));
  const width = String(ordered.length).length < 2 ? 2 : String(ordered.length).length;
  ordered.forEach((u, i) => { u.id = `U${String(i + 1).padStart(width, '0')}`; });
  return {
    selected: ordered.slice(0, cap),
    skipped: ordered.slice(cap).map((u) => ({ ...u, reason: `agent cap ${cap}` })),
  };
}

/** CLAUDE.md / INSIGHTS.md files the reviewer must read for the packages a unit touches. */
export function contextFiles(plan, files) {
  const pkgs = new Set(files.map((p) => plan.files.find((f) => f.path === p)?.package ?? 'root'));
  const out = ['CLAUDE.md'];
  for (const pkg of [...pkgs].sort()) {
    if (pkg === 'root') { out.push('INSIGHTS.md'); continue; }
    out.push(`${pkg}/CLAUDE.md`, `${pkg}/INSIGHTS.md`);
  }
  return [...new Set(out)].filter((p) => fs.existsSync(path.join(plan.repo, p)));
}

export function fill(template, vars) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const list = (xs) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (none)');

export function writeUnits(run, plan, opts = {}) {
  const { selected, skipped } = buildUnits(plan, opts);
  const template = fs.readFileSync(path.join(SKILL_DIR, 'references', 'reviewer-prompt.md'), 'utf8');
  const dir = path.join(run, 'units');
  fs.mkdirSync(dir, { recursive: true });
  const byPath = new Map(plan.files.map((f) => [f.path, f]));
  for (const u of selected) {
    const diffPath = path.join(dir, `${u.id}.diff`);
    fs.writeFileSync(diffPath, u.files.map((p) => byPath.get(p)?.diff ?? '').join('\n'));
    const prompt = fill(template, {
      UNIT_ID: u.id,
      SKILL: u.skill,
      SKILL_FILE: u.skillFile,
      REFERENCES: list(u.references),
      MAX_SEVERITY: u.maxSeverity,
      FILES: list(u.files.map((p) => `${p}${byPath.get(p)?.truncated ? ' (diff truncated — read the whole file)' : ''}`)),
      DIFF_FILE: diffPath,
      CONTEXT_FILES: list(contextFiles(plan, u.files)),
      RUBRIC_FILE: path.join(SKILL_DIR, 'references', 'severity-rubric.md'),
      OUTPUT_FILE: path.join(dir, `${u.id}.findings.json`),
      REPO: plan.repo,
      BASE: `${plan.base.ref} (merge-base ${plan.mergeBase.slice(0, 12)})`,
    });
    fs.writeFileSync(path.join(dir, `${u.id}.prompt.md`), prompt);
    u.prompt = path.join(dir, `${u.id}.prompt.md`);
    u.output = path.join(dir, `${u.id}.findings.json`);
  }
  const unitsJson = {
    version: 1,
    createdAt: new Date().toISOString(),
    diffHash: plan.diffHash,
    cap: opts.cap ?? DEFAULT_CAP,
    maxLines: opts.maxLines ?? DEFAULT_MAX_LINES,
    selected: selected.map(({ id, skill, side, priority, maxSeverity, files, changedLines, prompt, output }) => ({ id, skill, side, priority, maxSeverity, files, changedLines, prompt, output })),
    skipped: skipped.map(({ id, skill, files, changedLines, reason }) => ({ id, skill, files, changedLines, reason })),
  };
  fs.writeFileSync(path.join(run, 'units.json'), `${JSON.stringify(unitsJson, null, 2)}\n`);
  return unitsJson;
}

/** Write a verifier prompt for every CRITICAL reviewer finding that has no verifier answer yet. */
export function writeCriticals(run) {
  const unitsJson = JSON.parse(fs.readFileSync(path.join(run, 'units.json'), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(run, 'plan.json'), 'utf8'));
  const { results, findings } = readUnitResults(run, unitsJson);
  const template = fs.readFileSync(path.join(SKILL_DIR, 'references', 'verifier-prompt.md'), 'utf8');
  const map = loadMap(DEFAULT_MAP);
  const dir = path.join(run, 'verify');
  fs.mkdirSync(dir, { recursive: true });
  const seen = new Set();
  const todo = [];
  for (const f of findings) {
    if (f.severity !== 'CRITICAL' || !f.introducedByDiff || seen.has(f.id)) continue;
    seen.add(f.id);
    const answer = path.join(dir, `${f.id}.json`);
    const refs = (map.skills[f.skill]?.references ?? []).map((r) => `.claude/skills/${f.skill}/${r}`);
    const prompt = fill(template, {
      FINDING_ID: f.id,
      SKILL: f.skill,
      SKILL_FILE: `.claude/skills/${f.skill}/SKILL.md`,
      REFERENCES: list(refs),
      RULE: f.rule,
      FILE: f.file ?? '(no file)',
      LINE: f.line ?? '?',
      TITLE: f.title,
      EVIDENCE: f.evidence || '(none given)',
      FIX: f.fix || '(none given)',
      DIFF_FILE: path.join(run, 'units', `${f.unit}.diff`),
      CONTEXT_FILES: list(contextFiles(plan, f.file ? [f.file] : [])),
      RUBRIC_FILE: path.join(SKILL_DIR, 'references', 'severity-rubric.md'),
      OUTPUT_FILE: answer,
      REPO: plan.repo,
    });
    const promptPath = path.join(dir, `${f.id}.prompt.md`);
    fs.writeFileSync(promptPath, prompt);
    todo.push({ id: f.id, skill: f.skill, file: f.file, line: f.line, title: f.title, prompt: promptPath, output: answer, answered: fs.existsSync(answer) });
  }
  return { results, criticals: todo };
}

function usage() {
  return `Usage:
  node units.mjs --run <dir> [--cap N] [--max-lines N]   build units + reviewer prompts
  node units.mjs criticals --run <dir>                    build verifier prompts for CRITICALs`;
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] === 'criticals' ? argv.shift() : 'units';
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--run') o.run = v();
    else if (a === '--cap') o.cap = Number(v());
    else if (a === '--max-lines') o.maxLines = Number(v());
    else if (a === '-h' || a === '--help') { console.log(usage()); return; }
    else { console.error(`unknown argument ${a}\n${usage()}`); process.exit(1); }
  }
  if (!o.run) { console.error(`--run <dir> is required\n${usage()}`); process.exit(1); }
  const run = path.resolve(o.run);
  if (cmd === 'criticals') {
    const { results, criticals } = writeCriticals(run);
    const bad = Object.entries(results).filter(([, r]) => r.status !== 'done');
    for (const [id, r] of bad) console.log(`unit ${id}: ${r.status}${r.error ? ` — ${r.error}` : ''}`);
    console.log(`${criticals.length} CRITICAL finding(s) to verify${criticals.length ? ':' : '.'}`);
    for (const c of criticals) console.log(`  ${c.id}${c.answered ? ' (answered)' : ''} · ${c.skill} · ${c.file}:${c.line} · ${c.title}\n    prompt: ${c.prompt}`);
    return;
  }
  const plan = JSON.parse(fs.readFileSync(path.join(run, 'plan.json'), 'utf8'));
  const u = writeUnits(run, plan, { cap: o.cap, maxLines: o.maxLines });
  console.log(`${u.selected.length} review unit(s), ${u.skipped.length} skipped:`);
  for (const x of u.selected) console.log(`  ${x.id} · ${x.skill} · ${x.files.length} file(s), ${x.changedLines} changed lines\n    prompt: ${x.prompt}`);
  for (const x of u.skipped) console.log(`  skipped ${x.id} · ${x.skill} · ${x.reason}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
