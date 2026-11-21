/** In-memory helpers for the graph-core tests (plan 19 / P1-D). Shared by P1-F. */
import { parseModuleFacts } from '../src/adapters/astgrep/module-facts.js';
import type { ModuleResolution, ModuleResolverInstance } from '../src/domain/ports/module-resolver.js';
import { buildGraph, type GraphResult, type ParsedModule } from '../src/modules/repo-intel/graph/index.js';

/**
 * Fake resolver: `./x`/`../x` resolve against the file set (`.ts`, `/index.ts`,
 * `.d.ts`); `@/x` is an alias for `src/x`; `node:*` is builtin; bare names are
 * external; `./missing*` is `missing`.
 */
export function fakeResolver(
  files: Set<string>,
  tsconfigFailures: Array<{ path: string; message: string }> = [],
): ModuleResolverInstance {
  const dirname = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const norm = (p: string): string => {
    const out: string[] = [];
    for (const seg of p.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return out.join('/');
  };
  const probe = (base: string): string | null => {
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.d.ts`, `${base}/index.ts`]) if (files.has(c)) return c;
    return null;
  };
  return {
    resolve(from: string, spec: string): ModuleResolution {
      if (spec.startsWith('node:')) return { kind: 'builtin' };
      let base: string | null = null;
      if (spec.startsWith('.')) base = norm(`${dirname(from)}/${spec}`);
      else if (spec.startsWith('@/')) base = norm(`src/${spec.slice(2)}`);
      else return { kind: 'external' };
      const hit = probe(base);
      return hit ? { kind: 'file', path: hit } : { kind: 'unresolved', reason: 'missing' };
    },
    tsconfigFailures: () => tsconfigFailures,
  };
}

export interface Built {
  graph: GraphResult;
  modules: ParsedModule[];
}

export function build(sources: Record<string, string>, resolver?: ModuleResolverInstance): Built {
  const modules = Object.entries(sources).map(([path, src]) => ({ path, facts: parseModuleFacts(path, src) }));
  const r = resolver ?? fakeResolver(new Set(Object.keys(sources)));
  return { graph: buildGraph(modules, r), modules };
}

export const edgeStrs = (g: GraphResult): string[] =>
  g.edges.map((e) => `${e.fromPath}#${e.fromName} -${e.kind}/${e.confidence}-> ${e.toPath}#${e.toName}`).sort();
