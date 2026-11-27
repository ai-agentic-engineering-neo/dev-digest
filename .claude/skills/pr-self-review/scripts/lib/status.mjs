// Verdict lookup for a commit + the `devdigest/self-review` GitHub commit status.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, originRepo, resolveBase, revParse } from './git.mjs';
import { readJson, statePaths } from './util.mjs';

export const STATUS_CONTEXT = 'devdigest/self-review';

/** The stored result whose fingerprint equals the committed state of `ref` (or null). */
export function resultForCommit(root, ref = 'HEAD') {
  const sha = revParse(root, ref);
  const { baseSha } = resolveBase(root, sha);
  const fp = fingerprint(root, { baseSha, commit: sha });
  const result = readJson(path.join(statePaths(root).results, `${fp}.json`), null);
  return { sha, fingerprint: fp, result };
}

export function describe(result) {
  if (!result) return { state: 'pending', description: 'Not reviewed — run /pr-self-review' };
  if (result.verdict === 'pass' && result.override) {
    return { state: 'success', description: `override: ${result.override.reason}` };
  }
  if (result.verdict === 'pass') {
    const w = result.counts?.WARNING ?? 0;
    return { state: 'success', description: `pass · ${w} warning(s), 0 blocking` };
  }
  const n = result.blocking?.length ?? 0;
  return { state: 'failure', description: result.incomplete?.length ? 'review incomplete' : `${n} blocking CRITICAL finding(s)` };
}

function token() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  // Same store LocalSecretsProvider reads; never copied anywhere else.
  const p = path.join(os.homedir(), '.devdigest', 'secrets.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')).GITHUB_TOKEN || null;
  } catch {
    return null;
  }
}

const hasGh = () => spawnSync('gh', ['--version'], { stdio: 'ignore' }).status === 0;

/** Posts the status for `ref`. Never throws: returns { ok, state, message }. */
export async function postStatus(root, ref = 'HEAD', { dryRun = false } = {}) {
  let lookup;
  try {
    lookup = resultForCommit(root, ref);
  } catch (e) {
    return { ok: false, message: `cannot compute verdict: ${e.message}` };
  }
  const { sha, result } = lookup;
  const { state, description } = describe(result);
  const desc = description.slice(0, 140);
  const repo = originRepo(root);
  const short = sha.slice(0, 7);
  if (!repo) return { ok: false, state, message: 'origin is not a GitHub remote — status not posted' };
  if (dryRun) return { ok: true, state, message: `[dry-run] ${repo.owner}/${repo.repo}@${short} → ${state}: ${desc}` };

  const endpoint = `repos/${repo.owner}/${repo.repo}/statuses/${sha}`;
  if (hasGh()) {
    const r = spawnSync(
      'gh',
      ['api', '-X', 'POST', endpoint, '-f', `state=${state}`, '-f', `context=${STATUS_CONTEXT}`, '-f', `description=${desc}`],
      { encoding: 'utf8' },
    );
    if (r.status === 0) return { ok: true, state, message: `${STATUS_CONTEXT} → ${state} on ${short}` };
    return { ok: false, state, message: `gh api failed: ${(r.stderr || '').trim().slice(0, 300)}` };
  }
  const t = token();
  if (!t) return { ok: false, state, message: 'no gh CLI and no GitHub token (GH_TOKEN/GITHUB_TOKEN/~/.devdigest/secrets.json) — status not posted' };
  try {
    const res = await fetch(`https://api.github.com/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pr-self-review',
      },
      body: JSON.stringify({ state, context: STATUS_CONTEXT, description: desc }),
    });
    if (res.ok) return { ok: true, state, message: `${STATUS_CONTEXT} → ${state} on ${short}` };
    if (res.status === 422) return { ok: false, state, message: `commit ${short} is not on GitHub yet — push first` };
    return { ok: false, state, message: `GitHub API ${res.status}: ${(await res.text()).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, state, message: `GitHub API request failed: ${e.message}` };
  }
}
