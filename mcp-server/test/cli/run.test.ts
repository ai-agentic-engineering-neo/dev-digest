import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { runCli, MAX_DIFF_BYTES } from '../../src/cli/run.js';
import { EXIT } from '../../src/cli/exit.js';
import type { GitResult, GitRunner } from '../../src/cli/git.js';

const AGENTS = [{ id: 'agent-1', name: 'Security Reviewer', model: 'gpt-4.1' }];

const DIFF_TEXT = 'diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1,2 @@\n+const x = 1;\n';

const REVIEW_RESPONSE = {
  agent: { id: 'agent-1', name: 'Security Reviewer', model: 'gpt-4.1', ci_fail_on: 'critical' },
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 92,
  findings: [],
  grounding: '0/0 passed',
  blockers: 0,
  files_reviewed: 1,
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.001,
  project_context: { injected: [], skipped: [] },
};

interface Routes {
  agents?: unknown;
  agentsStatus?: number;
  adhoc?: { status: number; body: unknown };
}

function buildHttp(routes: Routes) {
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('http://localhost:3001', '');
    if (path === '/agents') {
      return new Response(JSON.stringify(routes.agents ?? AGENTS), { status: routes.agentsStatus ?? 200 });
    }
    if (path === '/reviews/adhoc' && init?.method === 'POST') {
      const r = routes.adhoc ?? { status: 200, body: REVIEW_RESPONSE };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 });
  });
  return { http: new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl }), fetchImpl };
}

interface GitFixture {
  repoRoot?: GitResult | Error;
  diff?: GitResult;
  untracked?: GitResult;
}

function buildGit(fixture: GitFixture = {}): { git: GitRunner; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async (args: string[]) => {
    if (args[0] === 'rev-parse') {
      const r = fixture.repoRoot ?? { exitCode: 0, stdout: '/repo\n', stderr: '' };
      if (r instanceof Error) throw r;
      return r;
    }
    if (args[0] === 'diff') {
      return fixture.diff ?? { exitCode: 0, stdout: DIFF_TEXT, stderr: '' };
    }
    if (args[0] === 'ls-files') {
      return fixture.untracked ?? { exitCode: 0, stdout: '', stderr: '' };
    }
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  });
  return { git: { run }, run };
}

function buildDeps(opts: { routes?: Routes; gitFixture?: GitFixture } = {}) {
  const { http, fetchImpl } = buildHttp(opts.routes ?? {});
  const { git, run: gitRun } = buildGit(opts.gitFixture ?? {});
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    deps: {
      git,
      http,
      apiBaseUrl: 'http://localhost:3001',
      cwd: '/repo/sub',
      stdout: (t: string) => stdout.push(t),
      stderr: (t: string) => stderr.push(t),
    },
    stdout,
    stderr,
    fetchImpl,
    gitRun,
  };
}

describe('runCli — exit-code matrix', () => {
  it('--help prints HELP_TEXT to stdout and exits 0, with no git/HTTP calls', async () => {
    const { deps, stdout, gitRun, fetchImpl } = buildDeps();
    const code = await runCli(['--help'], deps);
    expect(code).toBe(EXIT.OK);
    expect(stdout[0]).toContain('devdigest review — review your local changes before you push.');
    expect(gitRun).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('an unknown flag exits 2 with no git/HTTP calls', async () => {
    const { deps, gitRun, fetchImpl } = buildDeps();
    const code = await runCli(['--nope'], deps);
    expect(code).toBe(EXIT.USAGE);
    expect(gitRun).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('an unknown --mode value exits 2 with no git/HTTP calls', async () => {
    const { deps, gitRun, fetchImpl } = buildDeps();
    const code = await runCli(['--mode', 'bogus', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.USAGE);
    expect(gitRun).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('missing --agent exits 2 and lists the real agent ids fetched from GET /agents', async () => {
    const { deps, stderr, fetchImpl } = buildDeps();
    const code = await runCli(['--mode', 'working'], deps);
    expect(code).toBe(EXIT.USAGE);
    expect(stderr.join('\n')).toContain('agent-1 — Security Reviewer (gpt-4.1)');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('missing --agent falls back to plain usage text when GET /agents fails', async () => {
    const { deps, stderr } = buildDeps({ routes: { agentsStatus: 500, agents: { error: { message: 'boom' } } } });
    const code = await runCli(['--mode', 'working'], deps);
    expect(code).toBe(EXIT.USAGE);
    expect(stderr.join('\n')).toContain('Run with --help to see usage.');
  });

  it('--mode staged exits 2 with the seam\'s message and makes NO HTTP call', async () => {
    const { deps, stderr, fetchImpl } = buildDeps();
    const code = await runCli(['--mode', 'staged', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.USAGE);
    expect(stderr.join('\n')).toContain('--mode staged is not implemented yet');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('--mode branch exits 2 with the seam\'s message and makes NO HTTP call', async () => {
    const { deps, stderr, fetchImpl } = buildDeps();
    const code = await runCli(['--mode', 'branch', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.USAGE);
    expect(stderr.join('\n')).toContain('--mode branch is not implemented yet');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('not a git repository exits 3 with no HTTP call', async () => {
    const { deps, fetchImpl } = buildDeps({
      gitFixture: { repoRoot: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.ENVIRONMENT);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('git not on PATH (ENOENT) exits 3', async () => {
    const enoent = new Error('spawn git ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    const { deps } = buildDeps({ gitFixture: { repoRoot: enoent } });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.ENVIRONMENT);
  });

  it('empty diff exits 0 and makes NO HTTP call', async () => {
    const { deps, stdout, fetchImpl } = buildDeps({ gitFixture: { diff: { exitCode: 0, stdout: '   \n', stderr: '' } } });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.OK);
    expect(stdout.join('\n')).toContain('No tracked changes to review.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('an oversize diff exits 3 and makes NO HTTP call', async () => {
    const big = 'a'.repeat(MAX_DIFF_BYTES + 1);
    const { deps, stderr, fetchImpl } = buildDeps({ gitFixture: { diff: { exitCode: 0, stdout: big, stderr: '' } } });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.ENVIRONMENT);
    expect(stderr.join('\n')).toContain('over the 5 MB limit');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('warns about untracked files on stderr and still runs the review', async () => {
    const { deps, stderr } = buildDeps({
      gitFixture: { untracked: { exitCode: 0, stdout: 'a.txt\nb.txt\n', stderr: '' } },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.OK);
    expect(stderr.join('\n')).toContain('Note: 2 untracked file(s) not reviewed');
    expect(stderr.join('\n')).toContain('a.txt, b.txt');
  });

  it('agent not found (by id or name) exits 2 with no adhoc POST', async () => {
    const { deps, fetchImpl } = buildDeps();
    const code = await runCli(['--mode', 'working', '--agent', 'ghost'], deps);
    expect(code).toBe(EXIT.USAGE);
    // GET /agents happened (for resolution) but never POST /reviews/adhoc.
    const posted = fetchImpl.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(posted).toBe(false);
  });

  it('resolves the agent by case-insensitive name when the id does not match', async () => {
    const { deps } = buildDeps();
    const code = await runCli(['--mode', 'working', '--agent', 'SECURITY REVIEWER'], deps);
    expect(code).toBe(EXIT.OK);
  });

  it('blockers > 0 exits 1', async () => {
    const finding = {
      severity: 'CRITICAL',
      file: 'src/x.ts',
      start_line: 1,
      end_line: 1,
      title: 'Hardcoded secret',
      rationale: 'A literal key is committed.',
    };
    const { deps, stdout } = buildDeps({
      routes: { adhoc: { status: 200, body: { ...REVIEW_RESPONSE, blockers: 1, findings: [finding] } } },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.BLOCKING);
    expect(stdout.join('\n')).not.toContain('No findings');
    expect(stdout.join('\n')).toContain('Hardcoded secret');
  });

  it('blockers === 0 exits 0', async () => {
    const { deps } = buildDeps({ routes: { adhoc: { status: 200, body: { ...REVIEW_RESPONSE, blockers: 0 } } } });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.OK);
  });

  it('specs/09-project-context-folder.md AC-31 — the report names one injected and one missing document, the missing one marked with its reason', async () => {
    const { deps, stdout } = buildDeps({
      routes: {
        adhoc: {
          status: 200,
          body: {
            ...REVIEW_RESPONSE,
            project_context: {
              injected: [
                {
                  repo: { id: 'repo-1', full_name: 'acme/api' },
                  path: 'specs/invariants.md',
                  tokens: 42,
                  origin: 'agent',
                  skill: null,
                  status: 'included',
                  reason: null,
                },
              ],
              skipped: [
                {
                  repo: { id: 'repo-1', full_name: 'acme/api' },
                  path: 'specs/gone.md',
                  tokens: 0,
                  origin: 'agent',
                  skill: null,
                  status: 'omitted',
                  reason: 'missing',
                },
              ],
            },
          },
        },
      },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.OK);
    const out = stdout.join('\n');
    expect(out).toContain('specs/invariants.md (acme/api)');
    expect(out).toContain('specs/gone.md (acme/api) — skipped: missing');
  });

  it('a 404 from POST /reviews/adhoc exits 4', async () => {
    const { deps } = buildDeps({
      routes: { adhoc: { status: 404, body: { error: { code: 'not_found', message: 'Agent not found' } } } },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.REVIEW_FAILED);
  });

  it('regression: a 429 with error.code mislabeled "internal_error" is still detected by HTTP status and exits 4 with the rate-limit message', async () => {
    const { deps, stderr } = buildDeps({
      routes: { adhoc: { status: 429, body: { error: { code: 'internal_error', message: 'Rate limit exceeded' } } } },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.REVIEW_FAILED);
    expect(stderr.join('\n')).toContain('Rate limited');
  });

  it('a 500 from POST /reviews/adhoc exits 4 with the unexpected-server-error message', async () => {
    const { deps, stderr } = buildDeps({
      routes: { adhoc: { status: 500, body: { error: { code: 'internal_error', message: 'boom' } } } },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.REVIEW_FAILED);
    expect(stderr.join('\n')).toContain('unexpected error');
  });

  it('nothing_reviewable (422) exits 4 with the "no reviewable text lines" message', async () => {
    const { deps, stderr } = buildDeps({
      routes: {
        adhoc: {
          status: 422,
          body: { error: { code: 'nothing_reviewable', message: 'Nothing reviewable' } },
        },
      },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.REVIEW_FAILED);
    expect(stderr.join('\n')).toContain('only binary files, renames or deletions');
  });

  it('a config_error (missing provider key, HTTP 500) exits 4 with the "add the provider key" message', async () => {
    const { deps, stderr } = buildDeps({
      routes: {
        adhoc: {
          status: 500,
          body: { error: { code: 'config_error', message: 'OPENAI_API_KEY is not configured' } },
        },
      },
    });
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], deps);
    expect(code).toBe(EXIT.REVIEW_FAILED);
    expect(stderr.join('\n')).toContain('OPENAI_API_KEY is not configured');
    expect(stderr.join('\n')).toContain("Add the provider's API key in the web UI (Settings)");
  });

  it('a network failure on the POST call (GET /agents still reachable) exits 4 with the unreachable message', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace('http://localhost:3001', '');
      if (path === '/agents') return new Response(JSON.stringify(AGENTS), { status: 200 });
      if (path === '/reviews/adhoc' && init?.method === 'POST') throw new TypeError('fetch failed');
      return new Response('{}', { status: 404 });
    });
    const http = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const { git } = buildGit();
    const stderr: string[] = [];
    const code = await runCli(['--mode', 'working', '--agent', 'agent-1'], {
      git,
      http,
      apiBaseUrl: 'http://localhost:3001',
      cwd: '/repo/sub',
      stdout: () => {},
      stderr: (t) => stderr.push(t),
    });
    expect(code).toBe(EXIT.REVIEW_FAILED);
    expect(stderr.join('\n')).toContain('Cannot reach the Dev Digest API');
  });
});
