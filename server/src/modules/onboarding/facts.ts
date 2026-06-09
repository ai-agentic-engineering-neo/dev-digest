/**
 * A3 — deterministic repo analyzer for the onboarding generator.
 *
 * Computes the HARD facts about a JS/TS repo locally (no LLM, ~0 tokens) so the
 * single LLM call only has to write narrative, not guess. Everything here is
 * best-effort and bounded by the caps in constants.ts; route/endpoint detection
 * mixes file-convention (Next/SvelteKit) with light regex grepping.
 */
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import {
  BACKEND_DEPS,
  CODE_EXTS,
  FRONTEND_DEPS,
  FULLSTACK_DEPS,
  MAX_API_ENDPOINTS,
  MAX_ROUTES,
  MAX_WORKSPACE_PKGS,
  SERVICE_MAP,
  TEST_FILE_RE,
} from './constants.js';
import { cleanPath, isRecord, uniq } from './helpers.js';
import { collectKeyFiles, readCoverage, readJson, walk, type KeyFile } from './fs-walk.js';
import {
  NEST_RE,
  RR_JSX_RE,
  VERB_RE,
  nextAppRoute,
  nextPagesRoute,
  svelteKitRoute,
} from './parsers/routes.js';

export type { KeyFile };

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
}
export interface RepoFacts {
  isJsTs: boolean;
  /** Why analysis was skipped (only when !isJsTs). */
  reason?: string;
  name?: string;
  description?: string;
  flavor: 'frontend' | 'backend' | 'fullstack' | 'monorepo' | 'unknown';
  isMonorepo: boolean;
  packageManager: string;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
  services: string[];
  frameworks: string[];
  size: {
    totalFiles: number;
    codeFiles: number;
    byTopFolder: Record<string, number>;
    workspacePackages: number;
  };
  topFolders: string[];
  frontendRoutes: string[];
  apiEndpoints: ApiEndpoint[];
  tests: { runner: string | null; testFiles: number; coveragePct: number | null };
  keyFiles: KeyFile[];
}

/** Analyze a cloned repo into a facts bundle. Never throws on bad input. */
export async function analyzeRepo(root: string): Promise<RepoFacts> {
  const files = await walk(root);
  const norm = (p: string) => p.replace(/\\/g, '/');
  const relFiles = files.map(norm);

  // ---- locate package.json(s). Accept multi-folder repos with NO root
  // manifest (e.g. client/ + server/ + mcp/) by falling back to the shallowest
  // package.json as the "primary". Only bail if there is none anywhere.
  const pkgPaths = relFiles
    .filter((p) => p === 'package.json' || p.endsWith('/package.json'))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  if (pkgPaths.length === 0) {
    return emptyFacts('No package.json found — only JS/TS projects are supported.');
  }
  const primaryPkgPath = pkgPaths.includes('package.json') ? 'package.json' : pkgPaths[0]!;
  const rootPkg = (await readJson(join(root, primaryPkgPath))) ?? {};
  const workspacePkgs = pkgPaths
    .filter((p) => p !== primaryPkgPath)
    .slice(0, MAX_WORKSPACE_PKGS);
  const deps = new Set<string>();
  const devDeps = new Set<string>();
  collectDeps(rootPkg, deps, devDeps);
  for (const rel of workspacePkgs) {
    const pkg = await readJson(join(root, rel));
    if (pkg) collectDeps(pkg, deps, devDeps);
  }
  const allDeps = new Set([...deps, ...devDeps]);

  // ---- monorepo + package manager + flavor
  const isMonorepo =
    Boolean(rootPkg.workspaces) ||
    relFiles.includes('pnpm-workspace.yaml') ||
    pkgPaths.length > 1;
  const packageManager = relFiles.includes('pnpm-lock.yaml')
    ? 'pnpm'
    : relFiles.includes('yarn.lock')
      ? 'yarn'
      : relFiles.includes('package-lock.json')
        ? 'npm'
        : 'npm';

  const frameworks = [...FRONTEND_DEPS, ...BACKEND_DEPS, ...FULLSTACK_DEPS].filter((d) =>
    allDeps.has(d),
  );
  const hasFE = FRONTEND_DEPS.some((d) => allDeps.has(d));
  const hasBE = BACKEND_DEPS.some((d) => allDeps.has(d));
  const hasFullstack = FULLSTACK_DEPS.some((d) => allDeps.has(d));
  const flavor: RepoFacts['flavor'] =
    isMonorepo && hasFE && hasBE
      ? 'monorepo'
      : hasFullstack || (hasFE && hasBE)
        ? 'fullstack'
        : hasFE
          ? 'frontend'
          : hasBE
            ? 'backend'
            : 'unknown';

  // ---- services it talks to (from dependencies)
  const services = uniq(
    SERVICE_MAP.filter((s) => [...allDeps].some((d) => d.includes(s.match))).map((s) => s.label),
  );

  // ---- size + structure
  const codeFiles = relFiles.filter((p) => CODE_EXTS.has(extname(p)));
  const byTopFolder: Record<string, number> = {};
  for (const p of relFiles) {
    const top = p.includes('/') ? p.slice(0, p.indexOf('/')) : '(root)';
    byTopFolder[top] = (byTopFolder[top] ?? 0) + 1;
  }
  const topFolders = Object.keys(byTopFolder)
    .filter((f) => f !== '(root)')
    .sort();

  // ---- routes (file-convention) + endpoints (grep)
  const frontendRoutes = new Set<string>();
  const apiEndpoints: ApiEndpoint[] = [];
  const pushEndpoint = (method: string, rawPath: string, file: string) => {
    if (apiEndpoints.length >= MAX_API_ENDPOINTS) return;
    const path = cleanPath(rawPath);
    if (!path) return;
    if (apiEndpoints.some((e) => e.method === method && e.path === path)) return;
    apiEndpoints.push({ method, path, file });
  };

  for (const rel of relFiles) {
    if (frontendRoutes.size >= MAX_ROUTES && apiEndpoints.length >= MAX_API_ENDPOINTS) break;
    const nextApp = nextAppRoute(rel);
    if (nextApp) {
      if (nextApp.isApi) pushEndpoint('ANY', nextApp.path, rel);
      else if (frontendRoutes.size < MAX_ROUTES) frontendRoutes.add(nextApp.path);
      continue;
    }
    const nextPages = nextPagesRoute(rel);
    if (nextPages) {
      if (nextPages.isApi) pushEndpoint('ANY', nextPages.path, rel);
      else if (frontendRoutes.size < MAX_ROUTES) frontendRoutes.add(nextPages.path);
      continue;
    }
    const svelte = svelteKitRoute(rel);
    if (svelte && frontendRoutes.size < MAX_ROUTES) frontendRoutes.add(svelte);
  }

  // ---- grep code files for backend verbs / nest decorators / react-router literals
  const usesReactRouter = allDeps.has('react-router') || allDeps.has('react-router-dom');
  let reads = 0;
  for (const rel of codeFiles) {
    if (reads >= 1500) break;
    if (apiEndpoints.length >= MAX_API_ENDPOINTS && frontendRoutes.size >= MAX_ROUTES) break;
    const content = await readFile(join(root, rel), 'utf8').catch(() => '');
    if (!content) continue;
    reads++;
    for (const m of content.matchAll(VERB_RE)) {
      pushEndpoint((m[1] ?? '').toUpperCase(), m[2] ?? '', rel);
    }
    for (const m of content.matchAll(NEST_RE)) {
      pushEndpoint((m[1] ?? '').toUpperCase(), m[2] || '/', rel);
    }
    if (usesReactRouter && frontendRoutes.size < MAX_ROUTES) {
      for (const m of content.matchAll(RR_JSX_RE)) {
        const p = cleanPath(m[1] ?? '');
        if (p) frontendRoutes.add(p.startsWith('/') ? p : '/' + p);
      }
    }
  }

  // ---- tests + coverage
  const TEST_RUNNERS = ['vitest', 'jest', 'mocha', 'ava', '@playwright/test'];
  const runner = TEST_RUNNERS.find((r) => allDeps.has(r)) ?? null;
  const testFiles = relFiles.filter((p) => TEST_FILE_RE.test(p)).length;
  const coveragePct = await readCoverage(root);

  // ---- key files (heuristic) + excerpts
  const keyFiles = await collectKeyFiles(root, relFiles, rootPkg);

  return {
    isJsTs: true,
    name: typeof rootPkg.name === 'string' ? rootPkg.name : undefined,
    description: typeof rootPkg.description === 'string' ? rootPkg.description : undefined,
    flavor,
    isMonorepo,
    packageManager,
    scripts: isRecord(rootPkg.scripts) ? (rootPkg.scripts as Record<string, string>) : {},
    dependencies: [...deps].sort(),
    devDependencies: [...devDeps].sort(),
    services,
    frameworks,
    size: {
      totalFiles: relFiles.length,
      codeFiles: codeFiles.length,
      byTopFolder,
      workspacePackages: workspacePkgs.length,
    },
    topFolders,
    frontendRoutes: [...frontendRoutes].sort().slice(0, MAX_ROUTES),
    apiEndpoints,
    tests: { runner, testFiles, coveragePct },
    keyFiles,
  };
}

/** Merge a package.json's deps/devDeps into the running sets. */
function collectDeps(pkg: Record<string, unknown>, deps: Set<string>, dev: Set<string>): void {
  if (isRecord(pkg.dependencies)) for (const k of Object.keys(pkg.dependencies)) deps.add(k);
  if (isRecord(pkg.devDependencies)) for (const k of Object.keys(pkg.devDependencies)) dev.add(k);
}

export function emptyFacts(reason?: string): RepoFacts {
  return {
    isJsTs: false,
    reason,
    flavor: 'unknown',
    isMonorepo: false,
    packageManager: 'npm',
    scripts: {},
    dependencies: [],
    devDependencies: [],
    services: [],
    frameworks: [],
    size: { totalFiles: 0, codeFiles: 0, byTopFolder: {}, workspacePackages: 0 },
    topFolders: [],
    frontendRoutes: [],
    apiEndpoints: [],
    tests: { runner: null, testFiles: 0, coveragePct: null },
    keyFiles: [],
  };
}
