/**
 * NON-GATING dependency-graph measurement report (plan 19 / P1-F, AC-24a).
 *
 *   pnpm report:depgraph [repoRoot]
 *
 * Prints M1/M2/M3/M4/M7 for graph v3 next to the v1 numbers from
 * specs/18-dependency-graph.md. Same pure core as the fixture gate, no DB.
 * Always exits 0; wired into no test run and no CI job (the file name does not
 * match `*.test.ts`, so vitest never collects it).
 */
import { execFileSync } from 'node:child_process';
import { MODULE_SYMBOL, parseModuleFacts } from '../src/adapters/astgrep/module-facts.js';
import type { ModuleSymbol } from '../src/adapters/astgrep/module-facts.js';
import { buildGraph, measureGraph, type GraphResult, type ParsedModule } from '../src/modules/repo-intel/graph/index.js';
import { changedSymbols, git, intersectsHunk, isCode, parseFiles, parseHunks, realResolver, trackedCodeFiles } from './depgraph-fixture-utils.js';

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(0)}%`);
const frac = (n: number, d: number): string => `${n} / ${d} (${pct(n, d)})`;
const row = (id: string, v1: string, v3: string): void => {
  console.log(`${id.padEnd(4)} v1: ${v1.padEnd(58)} v3: ${v3}`);
};

function m1(root: string): string {
  let shas: string[] = [];
  try {
    shas = git(root, ['log', '-n', '10', '--format=%H', '--no-merges']).split('\n').filter(Boolean);
  } catch {
    return 'n/a (no git history)';
  }
  let v1All = 0;
  let reported = 0;
  let hit = 0;
  const perCommit: number[] = [];
  for (const sha of shas) {
    const patch = git(root, ['show', '-U0', '--no-renames', '--format=', sha]);
    let file: string | null = null;
    let deleted = false;
    let added = false;
    const per = new Map<string, string[]>();
    for (const line of patch.split('\n')) {
      if (line.startsWith('diff --git ')) {
        file = null;
        deleted = false;
        added = false;
      } else if (line.startsWith('new file mode')) added = true;
      else if (line.startsWith('deleted file mode')) deleted = true;
      else if (line.startsWith('+++ b/')) {
        file = line.slice(6);
        if (isCode(file) && !deleted) per.set(file, []);
      } else if (line.startsWith('--- a/') && deleted) {
        // deleted files: every old symbol is "changed"; skip (no head side to parse)
      } else if (line.startsWith('@@') && file && per.has(file)) {
        per.get(file)!.push(line);
      }
      void added;
    }
    let cReported = 0;
    let cHit = 0;
    for (const [path, hunkLines] of per) {
      const hunks = parseHunks(hunkLines.join('\n'));
      if (hunks.length === 0) continue;
      const show = (rev: string): ModuleSymbol[] => {
        try {
          return parseModuleFacts(path, execFileSync('git', ['show', `${rev}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })).symbols;
        } catch {
          return [];
        }
      };
      const head = show(sha);
      const base = show(`${sha}^`);
      v1All += head.filter((s) => s.name !== MODULE_SYMBOL).length;
      const names = changedSymbols(base, head, hunks);
      cReported += names.length;
      cHit += names.filter((n) => intersectsHunk(n, base, head, hunks)).length;
    }
    reported += cReported;
    hit += cHit;
    if (cReported > 0) perCommit.push(cHit / cReported);
  }
  const med = perCommit.sort((a, b) => a - b)[Math.floor(perCommit.length / 2)];
  return `${frac(hit, reported)} reported symbols hit a hunk (median per commit ${med === undefined ? 'n/a' : `${(med * 100).toFixed(0)}%`}); v1-style "every symbol in a changed file" would report ${v1All} vs ${reported}`;
}

function graphMeasures(modules: ParsedModule[], graph: GraphResult): { m2: string; m3: string; m4: string } {
  const edgeFromTo = new Set<string>();
  const edgeFromFile = new Set<string>();
  for (const e of graph.edges) {
    edgeFromTo.add(`${e.fromPath}\0${e.toPath}\0${e.toName}`);
    edgeFromFile.add(`${e.fromPath}\0${e.toPath}`);
  }
  const tally = (isType: boolean): { ok: number; total: number } => {
    let ok = 0;
    let total = 0;
    for (const b of graph.bindings) {
      if (b.isType !== isType) continue;
      const x = b.binding;
      if (x.kind === 'symbol') {
        total++;
        if (edgeFromTo.has(`${b.file}\0${x.file}\0${x.symbol}`)) ok++;
      } else if (x.kind === 'namespace') {
        total++;
        if (edgeFromFile.has(`${b.file}\0${x.file}`)) ok++;
      } else if (x.kind === 'unresolved' && x.reason !== 'non_literal') total++;
    }
    return { ok, total };
  };
  const v = tally(false);
  const t = tally(true);
  const m = measureGraph(modules, graph);
  const exact = graph.edges.filter((e) => e.confidence === 'exact').length;
  return {
    m2: `${frac(v.ok, v.total)} in-repo value bindings with a resolved edge`,
    m3: `${frac(t.ok, t.total)} in-repo type bindings with a resolved edge`,
    m4: `${frac(m.foreignExactEdges, exact)} exact edges to a non-binding, non-local name`,
  };
}

const ALIAS = /^(@\/|~\/|#|@devdigest\/|@[\w-]+\/)/;

function m7(modules: ParsedModule[], graph: GraphResult, label: string): string {
  const relSources = graph.imports.filter((i) => i.specifier.startsWith('.')).length;
  const aliasImports = graph.imports.filter((i) => ALIAS.test(i.specifier) && (i.resolvedFile !== null || i.unresolvedReason === 'missing'));
  const withRel = new Set(graph.imports.filter((i) => i.specifier.startsWith('.') && i.resolvedFile).map((i) => i.fromFile));
  const aliasFiles = new Set(aliasImports.map((i) => i.fromFile));
  const aliasOnly = [...aliasFiles].filter((f) => !withRel.has(f));
  const edgeFroms = new Set(graph.fileEdges.map((e) => e.from));
  const zero = aliasOnly.filter((f) => !edgeFroms.has(f)).length;
  void modules;
  return `${label}: ${graph.fileEdges.length} edges vs ${relSources} relative + ${aliasImports.length} alias sources; ${zero} / ${aliasOnly.length} alias-only files with zero edges`;
}

function main(): void {
  const root = process.argv[2] ?? git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const files = trackedCodeFiles(root);
  const all = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const modules = parseFiles(root, files);
  console.log(`depgraph report (non-gating) — root=${root}`);
  console.log(`${modules.length} TS/JS files parsed, ${modules.reduce((a, m) => a + m.facts.symbols.length, 0)} symbols (indexer budgets: excluded dirs, <=400 KB, <=5000 files)\n`);

  const graph = buildGraph(modules, realResolver(root, all));
  const g = graphMeasures(modules, graph);
  row('M1', '228 / 1086 (21%); median 34%', m1(root));
  row('M2', '943 / 2574 (37%)', g.m2);
  row('M3', '0 / 1239 (0%)', g.m3);
  row('M4', '445 / 2681 (17%)', g.m4);
  row('M7', '1385 edges vs 1580 relative + 646 alias; 57 alias-only files with zero edges', m7(modules, graph, 'resolver sees tsconfig.json'));
  // Control: a resolver that sees code files only (the pre-fix pipeline bug —
  // tsconfig.json invisible, so every `paths` alias stays unresolved).
  const codeOnly = buildGraph(modules, realResolver(root, files));
  row('M7*', '(same)', m7(modules, codeOnly, 'control: code files only, no tsconfig visible (pre-fix pipeline)'));
  console.log(`\ncoverage: ${JSON.stringify(graph.coverage)}`);
}

try {
  main();
} catch (err) {
  console.log(`report failed (non-gating): ${err instanceof Error ? err.message : String(err)}`);
}
process.exitCode = 0;
