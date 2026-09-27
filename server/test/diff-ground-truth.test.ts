/**
 * WP3.tests — ground truth for the diff parser against REAL local git, spawned
 * in a temp dir (no network, no Docker; unit lane per TESTING.md § server-unit).
 *
 * Generates file pairs with a seeded PRNG, commits base → head with real git,
 * diffs them through `SimpleGitClient.diff` (the pinned -c config + flags from
 * `simple-git.ts`), and checks the parser's output against ground truth we
 * control directly: the exact file content we wrote to disk, and real git's
 * own `--numstat` count — never the parser's own output on the same input.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { diffCountMismatches } from '../src/modules/reviews/helpers.js';
import { parseDiff, parseUnifiedDiff, numberDiff, sliceDiff, type UnifiedDiff } from '@devdigest/reviewer-core';

/** mulberry32 — a small, deterministic seeded PRNG (no dependency needed). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// Content-line pool from the plan's Test brief. Deliberately includes strings
// that LOOK like diff syntax ("+++ x", "@@ -1 +1 @@", the real "\ No newline"
// marker text) as ordinary file content, and non-ASCII "ф" — but no accented
// Latin letter, which macOS's filesystem can NFD-normalize and break an exact
// byte comparison (plan Test brief note).
const CONTENT_POOL = [
  '++ i',
  '-- old comment',
  '+++ x',
  '--- x',
  '@@ -1 +1 @@',
  'diff --git a/q b/q',
  '\\ No newline at end of file',
  '',
  ' ',
  'ф',
] as const;

function randomLines(rng: () => number, n: number): string[] {
  return Array.from({ length: n }, () => pick(rng, CONTENT_POOL));
}

function toText(lines: string[], noFinalNewline: boolean): string {
  return lines.join('\n') + (noFinalNewline ? '' : '\n');
}

/** Random insert / delete / replace edits on a copy of `base`. */
function editLines(rng: () => number, base: string[]): string[] {
  const out = base.slice();
  const ops = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < ops; i++) {
    const kind = pick(rng, ['insert', 'delete', 'replace'] as const);
    if (kind === 'insert' || out.length === 0) {
      out.splice(Math.floor(rng() * (out.length + 1)), 0, pick(rng, CONTENT_POOL));
    } else if (kind === 'delete') {
      out.splice(Math.floor(rng() * out.length), 1);
    } else {
      out[Math.floor(rng() * out.length)] = pick(rng, CONTENT_POOL);
    }
  }
  return out;
}

type Role = 'modified' | 'added' | 'deleted' | 'unchanged';

interface FilePlan {
  path: string;
  role: Role;
  baseContent?: string;
  headContent?: string;
}

// Paths from the plan's pool, each forced to a role that exercises it fully
// (added/deleted for the trickiest paths), plus generated "pad" files that
// vary per seed and cover the remaining roles at random.
const SPECIAL_PATHS: { path: string; role: Role }[] = [
  { path: 'x.ts', role: 'modified' },
  { path: 'sub/b/x.ts', role: 'modified' },
  { path: 'b/y.ts', role: 'modified' },
  { path: 'ф.ts', role: 'added' },
  { path: 'my file.ts', role: 'modified' },
  { path: 'q"uote.ts', role: 'deleted' },
  { path: 'a/b/c.ts', role: 'deleted' },
];

function makePlan(rng: () => number, path: string, role: Role): FilePlan {
  const baseLines = randomLines(rng, 3 + Math.floor(rng() * 8));
  const baseContent = toText(baseLines, rng() < 0.25);

  if (role === 'added') {
    const headLines = randomLines(rng, 2 + Math.floor(rng() * 6));
    return { path, role, headContent: toText(headLines, rng() < 0.25) };
  }
  if (role === 'deleted') {
    return { path, role, baseContent };
  }
  if (role === 'unchanged') {
    return { path, role, baseContent, headContent: baseContent };
  }
  // modified
  let headLines = editLines(rng, baseLines);
  if (headLines.join('\n') === baseLines.join('\n')) headLines.push('++ i'); // guarantee a real change
  const headContent = toText(headLines, rng() < 0.25);
  return { path, role, baseContent, headContent };
}

function buildFilePlan(rng: () => number): FilePlan[] {
  const plans: FilePlan[] = SPECIAL_PATHS.map(({ path, role }) => makePlan(rng, path, role));
  for (let i = 0; i < 18; i++) {
    const r = rng();
    const role: Role = r < 0.45 ? 'modified' : r < 0.6 ? 'added' : r < 0.8 ? 'deleted' : 'unchanged';
    plans.push(makePlan(rng, `pad/file${i}.ts`, role));
  }
  return plans; // ~25 files
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

interface SeedRepo {
  root: string;
  dir: string;
  repo: { owner: string; name: string };
  client: SimpleGitClient;
  baseSha: string;
  headSha: string;
  headContent: Record<string, string>;
  changedPaths: string[];
  diff: UnifiedDiff;
}

async function buildSeedRepo(seed: number): Promise<SeedRepo> {
  const root = await mkdtemp(join(tmpdir(), 'diff-ground-truth-'));
  const repo = { owner: 'o', name: 'r' };
  const dir = join(root, repo.owner, repo.name);
  await mkdir(dir, { recursive: true });

  const git = simpleGit(dir);
  await git.init();
  await git.raw(['config', 'user.name', 'Devdigest Test']);
  await git.raw(['config', 'user.email', 'test@devdigest.local']);
  await git.raw(['config', 'commit.gpgsign', 'false']);
  await git.raw(['config', 'core.autocrlf', 'false']);
  // The content pool is small (10 possible lines), so an unrelated add+delete
  // pair among ~25 generated files can coincidentally hit git's default rename
  // similarity threshold (>=50%) and get merged into one "rename" diff entry —
  // a real git behaviour, but orthogonal to what this parser test generates
  // file identities for. Disabling it here keeps "added"/"deleted"/"modified"
  // deterministic; `SimpleGitClient.diff` itself does not pin `diff.renames`,
  // so this is a test-fixture choice, not a claim about production behaviour.
  await git.raw(['config', 'diff.renames', 'false']);

  const rng = mulberry32(seed);
  const plan = buildFilePlan(rng);

  for (const f of plan) {
    if (f.baseContent !== undefined) await writeAt(dir, f.path, f.baseContent);
  }
  await git.raw(['add', '-A']);
  await git.raw(['commit', '-m', 'base', '--no-verify']);
  const baseSha = (await git.revparse(['HEAD'])).trim();

  for (const f of plan) {
    if (f.role === 'deleted') {
      await rm(join(dir, f.path), { force: true });
    } else if (f.headContent !== undefined) {
      await writeAt(dir, f.path, f.headContent);
    }
  }
  await git.raw(['add', '-A']);
  await git.raw(['commit', '-m', 'head', '--no-verify']);
  const headSha = (await git.revparse(['HEAD'])).trim();

  const client = new SimpleGitClient(root);
  const diff = await client.diff(repo, baseSha, headSha);

  const headContent: Record<string, string> = {};
  const changedPaths: string[] = [];
  for (const f of plan) {
    if (f.role !== 'unchanged') changedPaths.push(f.path);
    if (f.role !== 'deleted' && f.headContent !== undefined) headContent[f.path] = f.headContent;
  }

  return { root, dir, repo, client, baseSha, headSha, headContent, changedPaths: changedPaths.sort(), diff };
}

async function numstat(dir: string, base: string, head: string): Promise<Map<string, { add: number; del: number }>> {
  const git = simpleGit(dir);
  const raw = await git.raw(['diff', '--numstat', '-z', `${base}...${head}`]);
  const parts = raw.split('\0').filter((s) => s.length > 0);
  const map = new Map<string, { add: number; del: number }>();
  for (const part of parts) {
    const [add, del, path] = part.split('\t');
    map.set(path!, { add: Number(add), del: Number(del) });
  }
  return map;
}

describe('diff parser — ground truth against real local git', () => {
  const SEEDS = [1, 2, 3];
  const repos: Record<number, SeedRepo> = {};

  beforeAll(async () => {
    for (const seed of SEEDS) {
      repos[seed] = await buildSeedRepo(seed);
    }
  }, 60_000);

  afterAll(async () => {
    for (const seed of SEEDS) {
      await rm(repos[seed]!.root, { recursive: true, force: true });
    }
  });

  for (const seed of SEEDS) {
    describe(`seed ${seed}`, () => {
      it('every numbered ParsedDiffLine equals the real new-file line it claims to be', () => {
        const { diff, headContent } = repos[seed]!;
        const parsed = parseDiff(diff.raw);
        for (const file of parsed.files) {
          const lines = headContent[file.path]?.split('\n') ?? [];
          for (const line of parsed.lines.slice(file.start, file.end)) {
            if (line.newLine !== null) {
              expect(line.text.slice(1)).toBe(lines[line.newLine - 1]);
            }
          }
        }
      });

      it('every numberDiff line with a numeric gutter has the same property', () => {
        const { diff, headContent } = repos[seed]!;
        const parsed = parseDiff(diff.raw);
        const numbered = numberDiff(diff.raw).split('\n');
        for (const file of parsed.files) {
          const lines = headContent[file.path]?.split('\n') ?? [];
          for (let i = file.start; i < file.end; i++) {
            const rendered = numbered[i]!;
            const gutter = rendered.slice(0, 7).trim();
            if (gutter !== '') {
              expect(rendered.slice(8)).toBe(lines[Number(gutter) - 1]);
            }
          }
        }
      });

      it('diff.files lists exactly the paths that were added, modified or deleted', () => {
        const { diff, changedPaths } = repos[seed]!;
        expect(diff.files.map((f) => f.path).sort()).toEqual(changedPaths);
      });

      it("each file's additions/deletions equal real git's own --numstat count", async () => {
        const { diff, dir, baseSha, headSha } = repos[seed]!;
        const stats = await numstat(dir, baseSha, headSha);
        for (const file of diff.files) {
          const real = stats.get(file.path);
          expect(real, `no numstat entry for ${file.path}`).toBeDefined();
          expect({ add: file.additions, del: file.deletions }).toEqual({ add: real!.add, del: real!.del });
        }
      });

      it('sliceDiff round-trips: parseUnifiedDiff(sliceDiff(diff,p)).files is exactly [p]', () => {
        const { diff } = repos[seed]!;
        for (const file of diff.files) {
          const sliced = parseUnifiedDiff(sliceDiff(diff, file.path));
          expect(sliced.files).toEqual([file]);
        }
      });

      it('real git output never trips the count-mismatch detector', () => {
        const { diff } = repos[seed]!;
        expect(diffCountMismatches(diff)).toEqual([]);
      });
    });
  }

  it('AC-5: repo-local config that would otherwise change diff output does not, because SimpleGitClient pins its own -c/flags', async () => {
    const { client, repo, dir, baseSha, headSha, diff: before } = repos[1]!;

    const git = simpleGit(dir);
    // simple-git blocks `git config diff.external ...` by default (it's a
    // known command-injection vector) unless explicitly allowed — safe here,
    // we're only asserting SimpleGitClient's own `-c`/flags override it.
    const unsafeGit = simpleGit(dir, { unsafe: { allowUnsafeDiffExternal: true } });
    const extraConfig: Record<string, string> = {
      'diff.noprefix': 'true',
      'diff.mnemonicPrefix': 'true',
      'color.ui': 'always',
      'color.diff': 'always',
      'core.quotePath': 'true',
      'diff.external': 'false',
      'diff.suppressBlankEmpty': 'true',
      'diff.context': '1',
    };
    for (const [key, value] of Object.entries(extraConfig)) {
      const g = key === 'diff.external' ? unsafeGit : git;
      await g.raw(['config', key, value]);
    }

    const after = await client.diff(repo, baseSha, headSha);
    expect(after.files).toEqual(before.files);
    expect(after.raw).not.toMatch(/\x1b\[/);
  });
});
