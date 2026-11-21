/**
 * Real-DB + real-resolver check of the v3 pipeline (plan 19 / P1-E):
 * full index writes the graph, incremental re-binds importers (through a
 * barrel) and leaves nothing pointing at a deleted path (AC-7, AC-18).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { mkdtemp, mkdir, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { runFullIndex } from '../src/modules/repo-intel/pipeline/full.js';
import { runIncremental } from '../src/modules/repo-intel/pipeline/incremental.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import { TsModuleResolverFactory } from '../src/adapters/tsresolve/index.js';
import type { PipelineDeps } from '../src/modules/repo-intel/deps.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('v3 pipeline: graph rows, decl_file, incremental expansion', () => {
  let pg: PgFixture;
  let repoId: string;
  let repo: RepoIntelRepository;
  let root: string;
  let head = 'sha1';
  let diff: string[] = [];

  const deps = (): PipelineDeps =>
    ({
      git: { currentHead: async () => head, diffNameOnly: async () => diff },
      resolver: new TsModuleResolverFactory(),
      tokenizer: { count: (s: string) => Math.ceil(s.length / 4) },
    }) as unknown as PipelineDeps;
  const put = async (rel: string, body: string) => {
    await mkdir(join(root, rel.slice(0, rel.lastIndexOf('/'))), { recursive: true });
    await writeFile(join(root, rel), body);
  };
  const importsOf = async (from: string) =>
    pg.handle.db
      .select()
      .from(t.fileImports)
      .where(and(eq(t.fileImports.repoId, repoId), eq(t.fileImports.fromFile, from)));

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    root = await mkdtemp(join(tmpdir(), 'v3-graph-'));
    await put('src/lib.ts', 'export function f() { return 1; }\n');
    await put('src/barrel.ts', "export { f } from './lib';\n");
    await put('src/use.ts', "import { f } from './barrel';\nimport { z } from 'zod';\nexport function run() { z.object({}); return f(); }\n");
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'g', fullName: 'acme/g', clonePath: root })
      .returning();
    repoId = r!.id;
    repo = new RepoIntelRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(root, { recursive: true, force: true });
  });

  it('full index: v3 state + coverage, graph rows, file_edges from resolved imports, decl_file via the barrel', async () => {
    const res = await runFullIndex(deps(), repo, { repoId });
    expect(res.status).toBe('full');
    const state = await repo.tryGetIndexState(repoId);
    expect(state).toMatchObject({ indexerVersion: INDEXER_VERSION, reindexing: null });
    expect(state!.coverage).toBeTruthy();
    const edges = await repo.getEdges(repoId);
    expect(edges.map((e) => `${e.fromFile}>${e.toFile}`).sort()).toEqual(['src/barrel.ts>src/lib.ts', 'src/use.ts>src/barrel.ts']);
    const edgeRows = await pg.handle.db.select().from(t.symbolEdges).where(eq(t.symbolEdges.repoId, repoId));
    expect(edgeRows.some((e) => e.fromPath === 'src/use.ts' && e.toPath === 'src/lib.ts' && e.toName === 'f')).toBe(true);
    const refs = await pg.handle.db.select().from(t.references).where(eq(t.references.repoId, repoId));
    expect(refs.find((r) => r.toSymbol === 'f')?.declFile).toBe('src/lib.ts');
    expect(refs.some((r) => r.toSymbol === 'z')).toBe(false); // external: no row
  });

  it('incremental: changing lib re-binds the importer THROUGH the barrel', async () => {
    await put('src/lib.ts', 'export function f() { return 1; }\nexport const g = 2;\n');
    head = 'sha2';
    diff = ['src/lib.ts'];
    const res = await runIncremental(deps(), repo, { repoId });
    expect(res.reason).toBe('incremental');
    const impacted = await repo.getImpactedImporters(repoId, ['src/lib.ts']);
    expect(impacted.sort()).toEqual(['src/barrel.ts', 'src/use.ts']);
    expect((await importsOf('src/use.ts')).find((i) => i.localName === 'f')?.resolvedFile).toBe('src/barrel.ts');
  });

  it('incremental: deleting a file leaves no rows pointing at it', async () => {
    await unlink(join(root, 'src/lib.ts'));
    head = 'sha3';
    diff = ['src/lib.ts'];
    await runIncremental(deps(), repo, { repoId });
    const exp = await pg.handle.db.select().from(t.fileExports).where(eq(t.fileExports.repoId, repoId));
    const imp = await pg.handle.db.select().from(t.fileImports).where(eq(t.fileImports.repoId, repoId));
    const se = await pg.handle.db.select().from(t.symbolEdges).where(eq(t.symbolEdges.repoId, repoId));
    const fe = await repo.getEdges(repoId);
    const gone = 'src/lib.ts';
    expect(exp.some((r) => r.file === gone || r.resolvedFile === gone)).toBe(false);
    expect(imp.some((r) => r.fromFile === gone || r.resolvedFile === gone)).toBe(false);
    expect(se.some((r) => r.fromPath === gone || r.toPath === gone)).toBe(false);
    expect(fe.some((r) => r.fromFile === gone || r.toFile === gone)).toBe(false);
  });
});
