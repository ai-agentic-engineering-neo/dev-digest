#!/usr/bin/env node
// Steps 3 and 4 of pr-self-review. The rules here are applied by code, not by
// the reviewing model:
//   node verdict.mjs record <group-id> <findings.json | ->   store one group's findings
//   node verdict.mjs finalize                                 build the verdict, print the report
//   node verdict.mjs show                                     print the last report again
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PASSING,
  SKILL_DIR,
  loadCriticalIds,
  locateState,
  readJson,
  readText,
  snapshot,
  statePaths,
  writeJson,
} from './lib.mjs';

const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const IGNORE = /pr-self-review-ignore:\s*([\w./-]+)\s*(?:—|–|-{1,2}|:)\s*(\S.{2,})/;

/** The manifest for the tree as it is now; a changed tree has no manifest. */
function currentRun({ cwd, skillDir = SKILL_DIR } = {}) {
  const paths = statePaths(locateState(cwd));
  const snap = snapshot({ cwd, skillDir, base: readJson(paths.last)?.base });
  const manifest = readJson(paths.manifest(snap.key));
  if (!manifest) {
    throw new Error('the working tree changed since collect.mjs ran (or it never ran): run collect.mjs again');
  }
  return { manifest, paths };
}

function validate(raw, changed) {
  if (raw === null || typeof raw !== 'object') return 'not an object';
  if (!SEVERITIES.includes(raw.severity)) return `severity must be one of ${SEVERITIES.join(', ')}`;
  if (typeof raw.rule !== 'string' || !raw.rule.trim()) return 'rule id is missing';
  if (typeof raw.title !== 'string' || !raw.title.trim()) return 'title is missing';
  if (typeof raw.file !== 'string' || !changed.has(raw.file)) return 'file is not part of the change';
  if (!Number.isInteger(raw.line) || raw.line < 1) return 'line must be a positive integer';
  if (raw.endLine !== undefined && (!Number.isInteger(raw.endLine) || raw.endLine < raw.line)) {
    return 'endLine must be an integer >= line';
  }
  return null;
}

/** Store one group's findings. Throws on input that is not a findings list, so the group stays missing. */
export function record({ cwd, skillDir, groupId, input }) {
  const { manifest, paths } = currentRun({ cwd, skillDir });
  const group = manifest.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    const expected = manifest.groups.map((candidate) => candidate.id).join(', ') || 'none';
    throw new Error(`"${groupId}" is not a group of this run (expected: ${expected})`);
  }
  const list = Array.isArray(input) ? input : input?.findings;
  if (!Array.isArray(list)) throw new Error('expected {"findings": [...]}');
  const changed = new Set(manifest.files.filter((file) => file.status !== 'D').map((file) => file.path));
  const findings = [];
  const rejected = [];
  for (const raw of list) {
    const reason = validate(raw, changed);
    if (reason) rejected.push({ reason, finding: raw });
    else findings.push({ ...raw, group: groupId });
  }
  // Criticals the verifying session threw out. They do not block, but they are shown.
  const dismissed = (Array.isArray(input?.dismissed) ? input.dismissed : []).map((entry) => ({
    ...entry,
    group: groupId,
  }));
  writeJson(paths.group(group.key), { group: groupId, key: group.key, findings, rejected, dismissed });
  return { group: groupId, accepted: findings.length, dismissed: dismissed.length, rejected };
}

function overlapsAdded(file, finding) {
  const end = finding.endLine ?? finding.line;
  return file.addedRanges.some(([from, to]) => finding.line <= to && end >= from);
}

function suppression(root, finding) {
  const text = readText(root, finding.file);
  if (text == null) return null;
  const lines = text.split('\n');
  const end = finding.endLine ?? finding.line;
  for (let n = Math.max(1, finding.line - 1); n <= end; n++) {
    const hit = IGNORE.exec(lines[n - 1] ?? '');
    if (hit && hit[1] === finding.rule) return hit[2].replace(/\s*(\*\/|-->)\s*$/, '').trim();
  }
  return null;
}

const rank = (severity) => SEVERITIES.indexOf(severity);

/** Apply the gate rules to everything recorded and write the verdict for this tree. */
export function finalize({ cwd, skillDir = SKILL_DIR } = {}) {
  const { manifest, paths } = currentRun({ cwd, skillDir });
  const criticalIds = loadCriticalIds(skillDir);
  const byPath = new Map(manifest.files.map((file) => [file.path, file]));
  const incomplete = [...manifest.problems];
  if (manifest.depsSkipped) incomplete.push('collect.mjs ran with --no-deps, so import boundaries were not checked');

  const recorded = [];
  const rejected = [];
  const dismissed = [];
  for (const group of manifest.groups) {
    const stored = readJson(paths.group(group.key));
    if (!stored) {
      incomplete.push(`no review recorded for group "${group.id}"`);
      continue;
    }
    recorded.push(...stored.findings);
    rejected.push(...stored.rejected.map((entry) => ({ ...entry, group: group.id })));
    dismissed.push(...(stored.dismissed ?? []));
  }

  const merged = new Map();
  for (const item of [...manifest.mechanical, ...recorded]) {
    const id = `${item.file}:${item.line}:${item.rule}`;
    const seen = merged.get(id);
    if (!seen || rank(item.severity) < rank(seen.severity)) merged.set(id, item);
  }

  const blocking = [];
  const warnings = [];
  const suggestions = [];
  const suppressed = [];
  for (const item of merged.values()) {
    const finding = { ...item };
    if (!finding.mechanical || finding.suppressible) {
      const reason = suppression(manifest.root, finding);
      if (reason) {
        suppressed.push({ ...finding, reason });
        continue;
      }
    }
    if (finding.severity === 'CRITICAL' && !finding.mechanical) {
      if (!criticalIds.has(finding.rule)) {
        finding.severity = 'WARNING';
        finding.note = 'rated CRITICAL by the reviewer, but the rule is not listed in criticals.md';
      } else if (!overlapsAdded(byPath.get(finding.file), finding)) {
        finding.severity = 'WARNING';
        finding.note = 'pre-existing: the cited lines were not added or changed by this branch';
      } else if (finding.verified !== true || typeof finding.evidence !== 'string' || !finding.evidence.trim()) {
        incomplete.push(
          `critical ${finding.rule} at ${finding.file}:${finding.line} is not verified ` +
            '(needs "verified": true and "evidence": the offending code)',
        );
        continue;
      }
    }
    if (finding.severity === 'CRITICAL') blocking.push(finding);
    else if (finding.severity === 'WARNING') warnings.push(finding);
    else suggestions.push(finding);
  }

  let status = 'PASS';
  if (blocking.length) status = 'BLOCKED';
  else if (incomplete.length) status = 'INCOMPLETE';
  else if (warnings.length) status = 'PASS_WITH_WARNINGS';

  const verdict = {
    status,
    key: manifest.key,
    base: manifest.base,
    mergeBase: manifest.mergeBase,
    head: manifest.head,
    createdAt: new Date().toISOString(),
    blocking,
    warnings,
    suggestions,
    suppressed,
    dismissed,
    rejected,
    incomplete,
    coverage: manifest.groups.map((group) => ({
      group: group.id,
      lenses: group.lenses.map((lens) => ({ lens: lens.name, files: lens.files })),
    })),
    changedFiles: manifest.files.length,
    uncommitted: manifest.uncommitted,
    unroutedFiles: manifest.unroutedFiles,
    unroutedSkills: manifest.unroutedSkills,
  };
  writeJson(paths.verdict(manifest.key), verdict);
  return verdict;
}

const HEADLINE = {
  PASS: 'PASS — nothing blocks this PR.',
  PASS_WITH_WARNINGS: 'PASS WITH WARNINGS — nothing blocks this PR.',
  BLOCKED: 'BLOCKED — do not open or merge this PR.',
  INCOMPLETE: 'INCOMPLETE — the review did not finish, so the PR stays blocked.',
};

function findingLines(finding) {
  const out = [`- **${finding.title}** — \`${finding.file}:${finding.line}\` (\`${finding.rule}\`)`];
  if (finding.why) out.push(...String(finding.why).split('\n').map((line) => `  ${line}`));
  if (finding.fix) out.push(`  Fix: ${finding.fix}`);
  if (finding.note) out.push(`  Note: ${finding.note}`);
  if (finding.reason) out.push(`  Suppressed in code: ${finding.reason}`);
  return out;
}

export function report(verdict) {
  const out = [`# PR self-review: ${HEADLINE[verdict.status]}`, ''];
  out.push(
    `${verdict.blocking.length} critical, ${verdict.warnings.length} warning, ` +
      `${verdict.suggestions.length} suggestion, ${verdict.suppressed.length} suppressed — ` +
      `${verdict.changedFiles} changed files against ${verdict.base}.`,
  );
  const section = (title, items, render) => {
    if (!items.length) return;
    out.push('', `## ${title}`, '');
    for (const item of items) out.push(...render(item));
  };
  section('Critical (blocking)', verdict.blocking, findingLines);
  section('Why the review is incomplete', verdict.incomplete, (line) => [`- ${line}`]);
  section('Warnings', verdict.warnings, findingLines);
  section('Suggestions', verdict.suggestions, findingLines);
  section('Suppressed in code', verdict.suppressed, findingLines);
  section('Criticals dismissed on verification', verdict.dismissed, (entry) => [
    `- \`${entry.rule}\` at \`${entry.file}:${entry.line}\` (${entry.group}) — ${entry.reason ?? 'no reason given'}`,
  ]);
  section('Findings rejected as malformed', verdict.rejected, (entry) => [
    `- ${entry.group}: ${entry.reason} — ${JSON.stringify(entry.finding).slice(0, 200)}`,
  ]);
  section('Coverage', verdict.coverage, (entry) => [
    `- ${entry.group}: ${entry.lenses.map((lens) => `${lens.lens} (${lens.files.length})`).join(', ')}`,
  ]);
  section('Changed files no skill covers', verdict.unroutedFiles, (file) => [`- ${file}`]);
  section('Skills missing from routing.json', verdict.unroutedSkills, (name) => [`- ${name}`]);
  section('Uncommitted changes (reviewed, but not part of the PR until committed)', verdict.uncommitted, (file) => [
    `- ${file}`,
  ]);
  return `${out.join('\n')}\n`;
}

const EXIT = { PASS: 0, PASS_WITH_WARNINGS: 0, BLOCKED: 2, INCOMPLETE: 3 };

function main([command, ...args]) {
  if (command === 'record') {
    const [groupId, source] = args;
    if (!groupId || !source) throw new Error('usage: verdict.mjs record <group-id> <findings.json | ->');
    const input = JSON.parse(fs.readFileSync(source === '-' ? 0 : source, 'utf8'));
    process.stdout.write(`${JSON.stringify(record({ groupId, input }), null, 2)}\n`);
    return 0;
  }
  if (command === 'finalize') {
    const verdict = finalize();
    process.stdout.write(report(verdict));
    return EXIT[verdict.status];
  }
  if (command === 'show') {
    const { manifest, paths } = currentRun();
    const verdict = readJson(paths.verdict(manifest.key));
    if (!verdict) throw new Error('no verdict for this tree yet: run `verdict.mjs finalize`');
    process.stdout.write(report(verdict));
    return PASSING.has(verdict.status) ? 0 : EXIT[verdict.status];
  }
  throw new Error('usage: verdict.mjs record <group-id> <findings.json | -> | finalize | show');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`pr-self-review verdict: ${err.message}\n`);
    process.exitCode = 1;
  }
}
