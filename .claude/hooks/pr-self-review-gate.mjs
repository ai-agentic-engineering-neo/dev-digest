/**
 * PR Self Review — PreToolUse gate.
 *
 * Denies `git push` / `gh pr create|merge|ready` unless a FRESH, PASSING
 * pr-self-review report exists for the current HEAD.
 *
 * Invoked by .claude/hooks/pr-self-review-gate.sh, which resolves `node`.
 * Node built-ins only — this repo's lock files are off-limits.
 *
 * Contract (Claude Code PreToolUse):
 *   stdin  : one JSON object { hook_event_name, tool_name, tool_input, cwd, ... }
 *   stdout : the decision, as { hookSpecificOutput: { permissionDecision, ... } }
 *   exit   : ALWAYS 0. The exit code carries nothing; the JSON carries everything.
 *            A non-zero exit is treated as a hook ERROR and the tool RUNS ANYWAY,
 *            so every failure path here must still exit 0 with an explicit decision.
 *
 * On pass we print NOTHING and exit 0. We deliberately never return
 * permissionDecision:"allow" — that would bypass the normal permission prompt and
 * silently auto-approve every push. Silence lets the normal flow proceed untouched.
 *
 * Also usable as a CLI:
 *   node pr-self-review-gate.mjs --digest   # print the skills digest (single source of truth)
 *   node pr-self-review-gate.mjs --status   # human-readable gate status for the current HEAD
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_VERSION = 1;
const REPORT_REL = join('devdigest', 'pr-self-review.json');
const OVERRIDE_REL = join('devdigest', 'pr-self-review.override.json');

/** `git push`, allowing git's global options in between — `git -C <dir> push` and
 *  `git -c k=v push` are pushes too. */
const GIT_PUSH = /\bgit(?:\s+(?:-C|-c)\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+push\b/;
const GH_PR = /\bgh\s+pr\s+(?:create|merge|ready)\b/;

/** Commands that must not run while the gate is failing. Tested against the WHOLE
 *  command string, so `a && git push` and multi-line scripts are caught too. */
const GATED = [GIT_PUSH, GH_PR];

/** Escapes, judged per push — never against the whole command string, where
 *  `git push && echo --dry-run` would match. A push is exempt when it is a dry run
 *  (`--dry-run`/`-n`: nothing leaves the machine), a `--delete`, or `--tags` with
 *  no refspec (`git push origin --tags`: tags only). `git push origin HEAD --tags`
 *  pushes the branch too, so it is gated. Any `gh pr …` in the command is gated. */
function isExempt(command) {
  if (GH_PR.test(command)) return false;
  // Fail closed on shell constructs this tokenizer does not model: a flag inside
  // `$(…)`, backticks, a nested `sh -c` or `eval` is not a flag git receives,
  // so `bash -c "git push origin HEAD" -n` must not read as a dry run.
  if (/\$\(|`|\b(?:ba|z|da)?sh\s+-c\b|\beval\b/.test(command)) return false;
  const pushes = command.split(/[;&|\n]+/).filter((seg) => GIT_PUSH.test(seg));
  return pushes.length > 0 && pushes.every(isExemptPush);
}

function isExemptPush(segment) {
  // A shell comment passes nothing to git: `git push origin HEAD # --dry-run`.
  const code = segment.replace(/(^|\s)#.*$/, '');
  const args = code.slice(code.search(/\bpush\b/) + 'push'.length).trim().split(/\s+/).filter(Boolean);
  if (args.some((a) => a === '--dry-run' || a === '-n' || a === '--delete')) return true;
  // Positional args are the remote, then refspecs. An option's value would count
  // as positional too, which errs towards gating — the safe direction.
  const positional = args.filter((a) => !a.startsWith('-'));
  return args.includes('--tags') && positional.length <= 1;
}

const BYPASS = /\bPR_SELF_REVIEW_BYPASS=(?:1|true|yes)\b/;

// ---------------------------------------------------------------- output

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

const decide = (permissionDecision, permissionDecisionReason) =>
  emit({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason },
  });

const deny = (reason) => decide('deny', reason);
/** Infra failure — never deny on our own bug, never wave it through either. */
const ask = (reason) => decide('ask', reason);
const passSilent = () => process.exit(0);
const passWith = (systemMessage) => emit({ systemMessage });

// ---------------------------------------------------------------- helpers

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * sha256 over every `.claude/skills/*​/SKILL.md`, keyed by folder name and sorted,
 * so the digest is stable regardless of filesystem order. Exposed via `--digest`
 * so the skill and the hook can never compute it two different ways.
 */
export function skillsDigest(root) {
  const dir = join(root, '.claude', 'skills');
  if (!existsSync(dir)) return 'sha256:none';
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const h = createHash('sha256');
  for (const name of names) {
    const f = join(dir, name, 'SKILL.md');
    if (!existsSync(f)) continue;
    h.update(name);
    h.update('\0');
    h.update(createHash('sha256').update(readFileSync(f)).digest('hex'));
    h.update('\n');
  }
  return `sha256:${h.digest('hex')}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Waivers are honoured only for the exact commit they were written against, and
 * only with a reason long enough to be auditable. Anything rejected is surfaced
 * in the deny message rather than silently ignored.
 */
function loadWaivers(gitDir, headSha) {
  const problems = [];
  const ids = new Set();
  const path = join(gitDir, OVERRIDE_REL);
  if (!existsSync(path)) return { ids, problems };

  let doc;
  try {
    doc = readJson(path);
  } catch {
    problems.push('the override file is not valid JSON — no waiver applied');
    return { ids, problems };
  }
  if (doc.head_sha !== headSha) {
    problems.push(
      'waivers were written for a different commit — re-justify them after changing code',
    );
    return { ids, problems };
  }
  for (const w of doc.waived ?? []) {
    if (!w?.finding_id) continue;
    const reason = (w.reason ?? '').trim();
    if (reason.length < 40) {
      problems.push(
        `waiver for ${w.finding_id} rejected: reason too short to be auditable (${reason.length}/40 chars)`,
      );
      continue;
    }
    ids.add(w.finding_id);
  }
  return { ids, problems };
}

function describe(f) {
  const span = f.end_line && f.end_line !== f.start_line ? `-${f.end_line}` : '';
  const rule = f.source_rule ? ` (${f.source_skill ?? '?'} ${f.source_rule})` : '';
  return `🔴 ${f.title} — ${f.file}:${f.start_line}${span}${rule}`;
}

function blockMessage(blockers, extra = []) {
  const shown = blockers.slice(0, 5).map(describe);
  const more = blockers.length > 5 ? [`…and ${blockers.length - 5} more.`] : [];
  return [
    `PR Self Review: BLOCKED — ${blockers.length} CRITICAL finding${blockers.length === 1 ? '' : 's'}.`,
    '',
    ...shown,
    ...more,
    ...(extra.length ? ['', ...extra] : []),
    '',
    'Fix them, commit, then re-run /pr-self-review.',
    'Full report: .git/devdigest/pr-self-review.md',
    'To waive a false positive, see .claude/hooks/README.md.',
  ].join('\n');
}

const staleMessage = (what) =>
  [
    `PR Self Review: the report is STALE — ${what}.`,
    '',
    'Re-run /pr-self-review so the gate reflects what you are about to push.',
  ].join('\n');

// ---------------------------------------------------------------- gate

/** @returns {{gate:'pass'|'fail', blockers:any[], notes:string[]}} or throws */
function evaluate(cwd) {
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']);
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const headSha = git(cwd, ['rev-parse', 'HEAD']);

  const reportPath = join(gitDir, REPORT_REL);
  if (!existsSync(reportPath)) {
    return {
      gate: 'fail',
      stale: true,
      message: [
        'PR Self Review: no report found for this branch.',
        '',
        'Run /pr-self-review before pushing, so the change is reviewed against the',
        'skills that govern the files it touches.',
      ].join('\n'),
    };
  }

  let report;
  try {
    report = readJson(reportPath);
  } catch {
    throw new Error('report is present but unparseable');
  }
  if (report.schema_version !== SCHEMA_VERSION) {
    return {
      gate: 'fail',
      stale: true,
      message: staleMessage(
        `it uses schema_version ${report.schema_version}, this hook expects ${SCHEMA_VERSION}`,
      ),
    };
  }

  // --fast reports exist for your own edit loop. They skip the LLM review entirely,
  // so they can never satisfy the gate.
  if (report.mode !== 'full') {
    return {
      gate: 'fail',
      stale: true,
      message: staleMessage(
        `it was produced by \`/pr-self-review --fast\` (mode="${report.mode}"), which runs no review`,
      ),
    };
  }
  if (report.branch !== branch) {
    return { gate: 'fail', stale: true, message: staleMessage(`it was written on branch "${report.branch}", you are on "${branch}"`) };
  }
  if (report.head_sha !== headSha) {
    const diffMoved = (() => {
      try {
        return report.diff_digest !== diffDigest(cwd, report.base_ref);
      } catch {
        return true;
      }
    })();
    return {
      gate: 'fail',
      stale: true,
      message: staleMessage(
        diffMoved
          ? 'HEAD moved and the diff changed since it was written'
          : 'HEAD moved, though the diff itself is unchanged — only commit metadata moved, so the re-run is quick',
      ),
    };
  }
  let mergeBase = null;
  try {
    mergeBase = git(cwd, ['merge-base', report.base_ref ?? 'main', 'HEAD']);
  } catch {
    /* base ref may be gone; fall through to the mismatch below */
  }
  if (report.merge_base !== mergeBase) {
    return { gate: 'fail', stale: true, message: staleMessage(`the merge-base with ${report.base_ref ?? 'main'} moved, so the reviewed scope changed`) };
  }
  const digest = skillsDigest(root);
  if (report.skills_digest !== digest) {
    return { gate: 'fail', stale: true, message: staleMessage('a skill changed since the review ran, so it was judged against different rules') };
  }

  const { ids: waived, problems } = loadWaivers(gitDir, headSha);

  // Recomputed from findings — report.gate is NEVER trusted, the same principle the
  // product applies to the model's self-reported score.
  const blockers = (report.findings ?? []).filter(
    (f) => f.severity === 'CRITICAL' && f.verified !== 'downgraded' && !waived.has(f.id),
  );

  const notes = [];
  if (waived.size) notes.push(`${waived.size} waived CRITICAL${waived.size === 1 ? '' : 's'}`);
  const dirty = git(cwd, ['status', '--porcelain']);
  if (dirty) {
    const n = dirty.split('\n').filter(Boolean).length;
    notes.push(`${n} uncommitted file${n === 1 ? '' : 's'} not covered by this review`);
  }

  return { gate: blockers.length ? 'fail' : 'pass', blockers, problems, notes };
}

function diffDigest(cwd, baseRef) {
  const mb = git(cwd, ['merge-base', baseRef ?? 'main', 'HEAD']);
  const diff = execFileSync('git', ['diff', '--no-color', `${mb}`, 'HEAD'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return `sha256:${createHash('sha256').update(diff).digest('hex')}`;
}

// ---------------------------------------------------------------- CLI modes

const argv = process.argv.slice(2);
if (argv.includes('--digest')) {
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  process.stdout.write(`${skillsDigest(root)}\n`);
  process.exit(0);
}
if (argv.includes('--status')) {
  try {
    const r = evaluate(process.cwd());
    if (r.stale) process.stdout.write(`STALE\n${r.message}\n`);
    else if (r.gate === 'fail') process.stdout.write(`FAIL\n${blockMessage(r.blockers, r.problems)}\n`);
    else process.stdout.write(`PASS${r.notes.length ? ` (${r.notes.join('; ')})` : ''}\n`);
  } catch (e) {
    process.stdout.write(`ERROR ${e.message}\n`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- hook mode

const raw = await new Promise((res) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => res(buf));
  process.stdin.on('error', () => res(''));
});

let input;
try {
  input = JSON.parse(raw);
} catch {
  passSilent(); // Never break the session over a payload we failed to parse.
}

if (input.hook_event_name !== 'PreToolUse' || input.tool_name !== 'Bash') passSilent();

const command = input.tool_input?.command ?? '';

// Cheap first: a pure regex test, before any subprocess. Almost every Bash call in
// the session exits here without touching git.
if (!GATED.some((re) => re.test(command))) passSilent();
if (isExempt(command)) passSilent();

const cwd = input.cwd || process.cwd();

// Break glass. The env var is set on the command line being run, so the command
// string is the reliable place to look; an exported one is honoured too.
if (BYPASS.test(command) || BYPASS.test(`PR_SELF_REVIEW_BYPASS=${process.env.PR_SELF_REVIEW_BYPASS ?? ''}`)) {
  let detail = '';
  try {
    const r = evaluate(cwd);
    if (r.stale) detail = ' The report was stale.';
    else if (r.blockers?.length) {
      detail = ` ${r.blockers.length} CRITICAL finding(s) were NOT addressed: ${r.blockers
        .map((f) => `${f.title} (${f.file}:${f.start_line})`)
        .join('; ')}.`;
    }
  } catch {
    /* best effort — the bypass still stands */
  }
  passWith(
    `PR Self Review gate BYPASSED via PR_SELF_REVIEW_BYPASS.${detail} Log the reason in .claude/skills/pr-self-review/suppressions.md.`,
  );
}

let result;
try {
  result = evaluate(cwd);
} catch (e) {
  // Our own failure must not decide the push either way.
  ask(
    [
      `PR Self Review: the gate could not run (${e.message}).`,
      '',
      'This is a gate failure, not a review failure — nothing about your change is known.',
      'Re-run /pr-self-review, or approve manually if you are confident.',
    ].join('\n'),
  );
}

if (result.stale) deny(result.message);
if (result.gate === 'fail') deny(blockMessage(result.blockers, result.problems ?? []));

if (result.notes.length || (result.problems ?? []).length) {
  passWith(`PR Self Review: PASS. ${[...result.notes, ...(result.problems ?? [])].join('; ')}.`);
}
passSilent();
