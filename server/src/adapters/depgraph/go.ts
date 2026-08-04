/**
 * Go import-graph builder (docs/go-language-support-plan.md Phase 3).
 *
 * dependency-cruiser only understands the TS/JS module-resolution family, so
 * Go files need their own resolver: read go.mod's `module` directive, then
 * for each Go file's imports (parsed via astgrep/langs/go.ts through the
 * shared parseImports dispatcher), map any import path prefixed by the
 * module path to a local package directory and edge to every already-walked
 * Go file in that directory. Non-local imports (stdlib, third-party module
 * paths) are skipped — same "local files only" contract DepCruiseGraph
 * applies to TS/JS.
 *
 * Go resolves at the package (directory) level, not the file level — one
 * import statement pulls in the whole target package, so this fans an edge
 * out to every file in that directory rather than picking one representative
 * file (the v1 choice called out in the plan doc).
 *
 * Never throws: a missing/unparsable go.mod, or a file that fails to read or
 * parse, degrades that piece to no edges rather than failing the whole
 * build — mirrors DepCruiseGraph's try/catch-to-`[]` contract.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseImports } from '../astgrep/index.js';
import { languageIdForFile } from '../../modules/repo-intel/languages/index.js';
import type { DepGraph, FileEdge } from './index.js';

const MODULE_DIRECTIVE = /^module\s+(\S+)/m;

export class GoDepGraph implements DepGraph {
  async buildEdges(root: string, files: string[]): Promise<FileEdge[]> {
    const goFiles = files.filter((f) => languageIdForFile(f) === 'go');
    if (goFiles.length === 0) return [];

    const modulePath = await readModulePath(root);
    if (!modulePath) return [];

    const filesByDir = new Map<string, string[]>();
    for (const f of goFiles) {
      const dir = dirname(f);
      const bucket = filesByDir.get(dir);
      if (bucket) bucket.push(f);
      else filesByDir.set(dir, [f]);
    }

    const edges: FileEdge[] = [];
    const seen = new Set<string>();
    for (const from of goFiles) {
      let source: string;
      try {
        source = await readFile(join(root, from), 'utf8');
      } catch {
        continue;
      }

      let imports;
      try {
        imports = parseImports(from, source);
      } catch {
        continue;
      }

      for (const imp of imports) {
        const pkgDir = resolveLocalPackageDir(modulePath, imp.source);
        if (pkgDir === null) continue;
        const targets = filesByDir.get(pkgDir);
        if (!targets) continue;
        for (const to of targets) {
          if (to === from) continue;
          const key = `${from} ${to}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ from, to });
        }
      }
    }
    return edges;
  }
}

async function readModulePath(root: string): Promise<string | null> {
  try {
    const content = await readFile(join(root, 'go.mod'), 'utf8');
    return MODULE_DIRECTIVE.exec(content)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Maps an import path to a repo-relative package directory, or null if external. */
function resolveLocalPackageDir(modulePath: string, importPath: string): string | null {
  if (importPath === modulePath) return '.';
  if (importPath.startsWith(`${modulePath}/`)) return importPath.slice(modulePath.length + 1);
  return null;
}
