/**
 * Go support — end-to-end integration: walk a real Go "repo" on disk, run it
 * through `runFullIndex` against a real Postgres, and confirm actual
 * `symbols`/`references`/`file_edges`/`repo_index_state` rows land
 * correctly. Unit-level coverage of the parsing itself lives in
 * astgrep-go.test.ts/extract-go.test.ts/languages.test.ts (hermetic, no
 * DB), and of the Go import-graph resolver itself in depgraph-go.test.ts;
 * this is the one test that proves the whole pipeline (walk → parse →
 * persist → depgraph → index-state) wires together for a real language
 * other than TS/JS, matching Phase 6 of docs/go-language-support-plan.md.
 *
 * Fixture is generated on disk per-test (mkdtemp + writeFile), not a
 * committed fixtures/ directory — matches this repo's existing convention
 * (see indexer-pipeline.test.ts) rather than introducing a new one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { runFullIndex } from '../src/modules/repo-intel/pipeline/full.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const GO_MOD = `module example.com/greeter\n\ngo 1.22\n`;

const MAIN_GO = `package main

import (
	"fmt"

	"example.com/greeter/internal/util"
)

type Greeter struct {
	Name string
}

func (g *Greeter) Greet() string {
	return fmt.Sprintf("Hello, %s", util.Shout(g.Name))
}

type Speaker interface {
	Speak() string
}

func NewGreeter(name string) *Greeter {
	return &Greeter{Name: name}
}

func main() {
	g := NewGreeter("world")
	fmt.Println(g.Greet())
}
`;

const UTIL_GO = `package util

func Shout(s string) string {
	return s + "!"
}
`;

d('Go language support — runFullIndex over a real Go repo (Testcontainers pg)', () => {
  let pg: PgFixture;
  let cloneDir: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);

    cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-go-fixture-'));
    await mkdir(join(cloneDir, 'internal', 'util'), { recursive: true });
    await writeFile(join(cloneDir, 'go.mod'), GO_MOD);
    await writeFile(join(cloneDir, 'main.go'), MAIN_GO);
    await writeFile(join(cloneDir, 'internal', 'util', 'util.go'), UTIL_GO);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'greeter-go',
        fullName: 'acme/greeter-go',
        clonePath: cloneDir,
      })
      .returning();
    repoId = repo!.id;
  });

  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('indexes real Go source: symbols + references land in the DB, status is full', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ config, db: pg.handle.db });
    const repository = new RepoIntelRepository(pg.handle.db);

    const result = await runFullIndex(app.container, repository, { repoId });
    expect(result.status).toBe('full');
    expect(result.filesIndexed).toBeGreaterThan(0);

    const symbolRows = await pg.handle.db
      .select({ name: t.symbols.name, kind: t.symbols.kind, exported: t.symbols.exported })
      .from(t.symbols)
      .where(eq(t.symbols.repoId, repoId));
    const byName = new Map(symbolRows.map((s) => [s.name, s]));

    expect(byName.get('Greeter')?.kind).toBe('class'); // struct_type → 'class'
    expect(byName.get('Speaker')?.kind).toBe('interface');
    expect(byName.get('NewGreeter')?.kind).toBe('function');
    // dual-emit: both the qualified and bare method names are indexed.
    expect(byName.has('Greeter.Greet')).toBe(true);
    expect(byName.has('Greet')).toBe(true);
    // exported-ness is the Go naming convention, persisted through to the row.
    expect(byName.get('Greeter')?.exported).toBe(true);

    const referenceRows = await pg.handle.db
      .select({ toSymbol: t.references.toSymbol })
      .from(t.references)
      .where(eq(t.references.repoId, repoId));
    const refNames = referenceRows.map((r) => r.toSymbol);
    expect(refNames).toContain('NewGreeter'); // bare call
    expect(refNames).toContain('Greet'); // selector_expression call (g.Greet())

    // Phase 3 — GoDepGraph resolves the local "example.com/greeter/internal/util"
    // import (via go.mod's module directive) to a file_edges row; the stdlib
    // "fmt" import is skipped, same "local files only" contract as TS/JS.
    const edgeRows = await pg.handle.db
      .select({ fromFile: t.fileEdges.fromFile, toFile: t.fileEdges.toFile })
      .from(t.fileEdges)
      .where(eq(t.fileEdges.repoId, repoId));
    expect(edgeRows).toContainEqual({ fromFile: 'main.go', toFile: 'internal/util/util.go' });
    expect(edgeRows.some((e) => e.fromFile === 'fmt' || e.toFile === 'fmt')).toBe(false);

    // Phase 5 — repo_index_state.languages reflects this Go-only fixture
    // (go.mod isn't a parsed extension, so the walked+indexed set is
    // Go-only — a clean single-language assertion).
    const [indexState] = await pg.handle.db
      .select({ languages: t.repoIndexState.languages })
      .from(t.repoIndexState)
      .where(eq(t.repoIndexState.repoId, repoId));
    expect(indexState?.languages).toEqual(['go']);

    await app.close();
  });
});
