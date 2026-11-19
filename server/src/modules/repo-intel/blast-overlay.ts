/**
 * PR overlay for blast reads (plan 19 / P2-B; AC-25a…f). NOT pure: it reads
 * git objects, parses with ast-grep and builds a module resolver — that is why
 * it sits next to `service.ts`, outside `graph/` (the `pure-graph-core` arch
 * rule). The graph core it feeds stays pure.
 *
 * What it does, per blast read, entirely in memory (nothing is persisted):
 *   1. reads the PR's changed supported files at the HEAD sha (concurrency 8,
 *      `MAX_OVERLAY_FILES` 200, per-file `MAX_FILE_SIZE` / `MAX_PARSE_MS_PER_FILE`);
 *   2. if the head object is missing, fetches the PR head ONCE and rechecks,
 *      else every file is degraded (base-only);
 *   3. builds a second resolver over (indexed files − deleted + added + json
 *      files, so tsconfig `paths` keep working) and re-binds the head files
 *      against the persisted graph context;
 *   4. exposes the head files' replacement edges / facts through a `BlastSource`
 *      that masks the replaced files' persisted edges.
 */
import { extname } from 'node:path';
import type { ModuleFacts } from '../../domain/module-facts.js';
import type { GitClient } from '../../domain/ports/git.js';
import type { ModuleResolver } from '../../domain/ports/module-resolver.js';
import type { RepoRef } from '@devdigest/shared';
import {
  MAX_FILE_SIZE,
  MAX_OVERLAY_FILES,
  OVERLAY_CONCURRENCY,
  SUPPORTED_EXT,
} from './constants.js';
import { buildGraph, type ParsedModule, type SymbolEdgeRow } from './graph/index.js';
import type { BlastSource, SymbolRef } from './graph/blast.js';
import type { ChangedFileInput } from './graph/changed.js';
import type { FileFactsLite } from './graph/entry-points.js';
import { contextModules } from './pipeline/context.js';
import { makeReadText, parseSource } from './pipeline/index-rows.js';
import { walkClone } from './pipeline/walk.js';
import type { GraphContextRows } from './repository.js';

const SUPPORTED: ReadonlySet<string> = new Set(SUPPORTED_EXT);
const isSupported = (p: string): boolean => SUPPORTED.has(extname(p).toLowerCase());
const isRemoved = (s: string | null | undefined): boolean => s === 'removed' || s === 'deleted';

export interface OverlayHeadFile {
  facts: ModuleFacts;
  endpoints: string[];
  crons: string[];
}

export interface OverlayBuild {
  /** Parsed head files by path. */
  head: Map<string, OverlayHeadFile>;
  /** Paths whose persisted graph rows must be ignored (parsed, deleted, renamed-from). */
  replaced: Set<string>;
  /** Head-side edges of the parsed files (before the deleted-target filter). */
  edges: SymbolEdgeRow[];
  /** Changed supported files that fell back to base-only data. */
  degraded: string[];
}

export interface OverlayArgs {
  git: Pick<GitClient, 'readFileAtRef' | 'hasObject' | 'fetchPullHead'>;
  resolver: ModuleResolver;
  ref: RepoRef;
  /** Absolute clone root; null ⇒ nothing can be read, every candidate is degraded. */
  root: string | null;
  headSha: string | null;
  prNumber: number | null;
  files: readonly ChangedFileInput[];
  /** Every indexed code path (base). */
  indexedPaths: ReadonlySet<string>;
  /** Persisted graph context, loaded lazily — only when at least one head file parsed. */
  loadContext: () => Promise<GraphContextRows>;
}

// `.json` files change rarely: remember the walk per (clone, indexed sha) so a PR page refresh does not re-walk the clone.
const jsonCache = new Map<string, string[]>();
const JSON_CACHE_MAX = 16;
export async function jsonFilesFor(root: string, key: string): Promise<string[]> {
  const k = `${root}\0${key}`;
  const hit = jsonCache.get(k);
  if (hit) return hit;
  const { jsonFiles } = await walkClone(root);
  if (jsonCache.size >= JSON_CACHE_MAX) jsonCache.delete(jsonCache.keys().next().value as string);
  jsonCache.set(k, jsonFiles);
  return jsonFiles;
}

async function mapPool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function buildOverlay(args: OverlayArgs, jsonKey: string): Promise<OverlayBuild> {
  const out: OverlayBuild = { head: new Map(), replaced: new Set(), edges: [], degraded: [] };

  // Deleted / renamed-from files: their persisted rows go away whether or not head can be read.
  const removedPaths = new Set<string>();
  const candidates: string[] = [];
  for (const f of args.files) {
    if (isRemoved(f.status)) {
      removedPaths.add(f.path);
      continue;
    }
    if (f.status === 'renamed' && f.previousPath && f.previousPath !== f.path) removedPaths.add(f.previousPath);
    if (!isSupported(f.path)) continue;
    // No diff and not new ⇒ legacy whole-file read of the base index; nothing to overlay.
    if (f.patch == null && f.status !== 'added' && f.status !== 'renamed') continue;
    candidates.push(f.path);
  }
  for (const p of removedPaths) out.replaced.add(p);
  if (!args.headSha || candidates.length === 0) return out;

  const toParse = candidates.slice(0, MAX_OVERLAY_FILES);
  out.degraded.push(...candidates.slice(MAX_OVERLAY_FILES));

  // Head object present? One targeted fetch, then give up (AC-25c).
  let hasHead = args.root !== null && (await args.git.hasObject(args.ref, args.headSha).catch(() => false));
  if (!hasHead && args.root !== null && args.prNumber !== null) {
    await args.git.fetchPullHead(args.ref, args.prNumber).catch(() => undefined);
    hasHead = await args.git.hasObject(args.ref, args.headSha).catch(() => false);
  }
  if (!hasHead) {
    out.degraded.push(...toParse);
    return out;
  }

  await mapPool(toParse, OVERLAY_CONCURRENCY, async (path) => {
    // `readFileAtRef` never throws; null covers missing / oversize / binary.
    const source = await args.git.readFileAtRef(args.ref, args.headSha!, path, MAX_FILE_SIZE);
    if (source === null) {
      out.degraded.push(path);
      return;
    }
    try {
      const parsed = await parseSource(path, source);
      out.head.set(path, { facts: parsed.facts, endpoints: parsed.endpoints, crons: parsed.crons });
    } catch {
      out.degraded.push(path);
    }
  });
  out.degraded.sort();
  for (const p of out.head.keys()) out.replaced.add(p);
  if (out.head.size === 0 || args.root === null) return out;

  // Resolver over the HEAD file set. Json files must be visible: tsconfig `paths` live there.
  const files = new Set<string>(args.indexedPaths);
  for (const p of removedPaths) files.delete(p);
  for (const p of out.head.keys()) files.add(p);
  for (const j of await jsonFilesFor(args.root, jsonKey)) files.add(j);
  const resolver = args.resolver.create({ root: args.root, files, readText: makeReadText(args.root) });

  const context = contextModules(await args.loadContext(), out.replaced);
  const overlayModules: ParsedModule[] = [...out.head].map(([path, h]) => ({ path, facts: h.facts }));
  const graph = buildGraph([...context, ...overlayModules], resolver);
  out.edges = graph.edges.filter((e) => out.head.has(e.fromPath));
  return out;
}

/** Persisted reads the overlay wraps (the repository satisfies this structurally). */
export interface PersistedBlastReads {
  incomingEdges(targets: readonly SymbolRef[]): Promise<SymbolEdgeRow[]>;
  fileFacts(paths: readonly string[]): Promise<ReadonlyMap<string, FileFactsLite>>;
  fileRanks(paths: readonly string[]): Promise<ReadonlyMap<string, number>>;
}

/**
 * Persisted source with the overlay applied: edges FROM a replaced file come
 * from head (or vanish for deleted files); head edges never target a deleted
 * symbol (AC-26); head files' endpoint/cron facts override the stored ones.
 */
export function overlaySource(
  persisted: PersistedBlastReads,
  overlay: OverlayBuild,
  deletedIds: ReadonlySet<string>,
): BlastSource {
  const headEdges = overlay.edges.filter((e) => !deletedIds.has(`${e.toPath}#${e.toName}`));
  return {
    incomingEdges: async (targets) => {
      const wanted = new Set(targets.map((t) => `${t.path}#${t.name}`));
      const base = (await persisted.incomingEdges(targets)).filter((e) => !overlay.replaced.has(e.fromPath));
      return [...base, ...headEdges.filter((e) => wanted.has(`${e.toPath}#${e.toName}`))];
    },
    fileFacts: async (paths) => {
      const got = new Map(await persisted.fileFacts(paths.filter((p) => !overlay.head.has(p))));
      for (const p of paths) {
        const h = overlay.head.get(p);
        if (h) got.set(p, { endpoints: h.endpoints, crons: h.crons });
      }
      return got;
    },
    fileRanks: (paths) => persisted.fileRanks(paths),
  };
}
