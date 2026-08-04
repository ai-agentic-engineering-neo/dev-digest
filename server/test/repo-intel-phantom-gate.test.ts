import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

/**
 * T1.3 — `getUnresolvedReferences` (the phantom-API gate) positive path.
 * Previously only degraded-contract cases were covered
 * (repo-intel-facade-degraded.test.ts) — no test exercised real source
 * through `parseInvocationHeads` + the globals allowlist. That gap is how
 * a real bug shipped: extending `parseInvocationHeads` to Go without a
 * Go-aware globals allowlist meant every ordinary use of `len`/`make`/
 * `append` in a Go file was flagged as a phantom API.
 *
 * Hermetic: real files on disk (mkdtemp + writeFile, this repo's
 * established fixture convention), `repo` patched to skip the DB — same
 * pattern as repo-intel-facade-degraded.test.ts's `buildDegradedService`.
 */
function buildService(clonePath: string): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => ({
      id: 'r1',
      owner: 'acme',
      name: 'app',
      defaultBranch: 'main',
      clonePath,
    }),
  };
  return svc;
}

describe('RepoIntelService.getUnresolvedReferences — positive path', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it('TS: flags a genuinely undeclared/unimported bare call, not a JS global or a local declaration', async () => {
    root = await mkdtemp(join(tmpdir(), 'phantom-gate-ts-'));
    await writeFile(
      join(root, 'a.ts'),
      `export function real() {
  console.log(JSON.stringify({}));
  Math.max(1, 2);
  real();
  return phantomCall();
}
`,
    );

    const svc = buildService(root);
    const refs = await svc.getUnresolvedReferences('r1', ['a.ts']);
    const names = refs.map((r) => r.symbolName);

    expect(names).toContain('phantomCall');
    expect(names).not.toContain('console');
    expect(names).not.toContain('JSON');
    expect(names).not.toContain('Math');
    expect(names).not.toContain('real');
  });

  it('Go: does not flag builtin functions or builtin-type conversions as phantom', async () => {
    root = await mkdtemp(join(tmpdir(), 'phantom-gate-go-'));
    await writeFile(
      join(root, 'main.go'),
      `package main

func main() {
	s := make([]int, 0)
	s = append(s, 1)
	n := len(s)
	str := string(rune(n))
	println(str)
}
`,
    );

    const svc = buildService(root);
    const refs = await svc.getUnresolvedReferences('r1', ['main.go']);
    const names = refs.map((r) => r.symbolName);

    expect(names).not.toContain('make');
    expect(names).not.toContain('append');
    expect(names).not.toContain('len');
    expect(names).not.toContain('string');
    expect(names).not.toContain('rune');
    expect(names).not.toContain('println');
  });

  it('Go: still flags a genuinely undeclared/unimported bare call', async () => {
    root = await mkdtemp(join(tmpdir(), 'phantom-gate-go-real-'));
    await writeFile(
      join(root, 'main.go'),
      `package main

func main() {
	phantomCall()
}
`,
    );

    const svc = buildService(root);
    const refs = await svc.getUnresolvedReferences('r1', ['main.go']);
    expect(refs.map((r) => r.symbolName)).toContain('phantomCall');
  });

  it('Go: does not flag a call to a function declared elsewhere in the same file', async () => {
    root = await mkdtemp(join(tmpdir(), 'phantom-gate-go-local-'));
    await writeFile(
      join(root, 'main.go'),
      `package main

func helper() int {
	return 1
}

func main() {
	_ = helper()
}
`,
    );

    const svc = buildService(root);
    const refs = await svc.getUnresolvedReferences('r1', ['main.go']);
    expect(refs.map((r) => r.symbolName)).not.toContain('helper');
  });
});
