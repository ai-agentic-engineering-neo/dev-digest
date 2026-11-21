import type { BlastGraphEnvelope, BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type {
  BlastCallerRow,
  BlastGraphResult,
  DegradedReason,
  IndexStatus,
  RepoIntel,
} from '../../domain/ports/repo-intel.js';

/** Per-changed-symbol caller cap in the list view (`data.downstream[].callers`). */
const MAX_CALLERS_PER_SYMBOL = 20;

/**
 * What blast needs from the PR/file side — declared HERE, not imported from
 * the reviews module (`no-cross-module` forbids `modules/blast` importing
 * `modules/reviews` directly, including type-only). `ReviewRepository`
 * satisfies this structurally, so `routes.ts` — the one ring allowed to know
 * concrete classes — can still pass `container.reviewRepo` while this module
 * stays independent of reviews' internals. Mirrors `reviews/service.ts`'s
 * `AgentLookup` pattern.
 *
 * `RepoIntel` itself is different: it's already the cross-module-safe facade
 * every feature is meant to read repo intelligence through, so it's imported
 * directly from `repo-intel/types.ts` below rather than re-declared here.
 */
export interface PrFileLookup {
  getPull(
    workspaceId: string,
    prId: string,
  ): Promise<
    { id: string; repoId: string; number: number; headSha: string; baseSha: string | null } | undefined
  >;
  getPrFiles(
    prId: string,
  ): Promise<
    { path: string; patch: string | null; status: string | null; previousPath: string | null }[]
  >;
}

/** Parsed query of `GET /pulls/:id/blast` (already validated/clamped at the route). */
export interface BlastQuery {
  depth?: number;
  includeTypeOnly: boolean;
}

/**
 * `GET /pulls/:id/blast` response envelope (specs/07 §API, extended additively
 * by specs/18 — `index`/`overlay`/`graph`/`reindexing`). `data` still validates
 * the unchanged `BlastRadius` schema so old clients keep working (AC-34).
 */
export interface BlastEnvelope extends BlastGraphEnvelope {
  status: IndexStatus;
  degradedReason?: DegradedReason;
  data: BlastRadius;
  reindexing?: NonNullable<BlastGraphResult['reindexing']>;
}

/**
 * Blast Radius application service — thin read, zero LLM calls, entirely
 * compute-on-request over `repo-intel`'s persistent index + PR overlay.
 */
export class BlastService {
  constructor(
    private prFiles: PrFileLookup,
    private repoIntel: RepoIntel,
  ) {}

  async getBlast(workspaceId: string, prId: string, query: BlastQuery = { includeTypeOnly: true }): Promise<BlastEnvelope> {
    const pull = await this.prFiles.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.prFiles.getPrFiles(prId);
    const result = await this.repoIntel.getBlastGraph(pull.repoId, {
      headSha: pull.headSha,
      baseSha: pull.baseSha,
      prNumber: pull.number,
      files: files.map((f) => ({
        path: f.path,
        patch: f.patch,
        status: f.status,
        previousPath: f.previousPath,
      })),
      depth: query.depth,
      includeTypeOnly: query.includeTypeOnly,
    });

    const envelope: BlastEnvelope = {
      status: result.index.status ?? 'degraded',
      data: toBlastRadius(result),
      index: result.index,
      overlay: result.overlay,
      graph: result.graph,
    };
    if (result.reindexing) envelope.reindexing = result.reindexing;
    if (result.fallback) envelope.degradedReason = result.fallback;
    return envelope;
  }
}

/**
 * Pure mapper: groups the flat `callers[]` into `downstream[]` by `viaSymbol`
 * (capped at MAX_CALLERS_PER_SYMBOL), attaching each group's
 * `endpoints_affected`/`crons_affected` from that group's OWN caller files.
 * `type_only` is set only when the caller's graph node is type-only. While
 * reindexing the result is empty-but-valid. No LLM call, so `summary` unset.
 */
function toBlastRadius(result: BlastGraphResult): BlastRadius {
  if (result.reindexing) return { changed_symbols: [], downstream: [] };

  const changed_symbols = result.changed.map((s) => ({ name: s.name, file: s.file, kind: s.kind }));
  const typeOnlyIds = new Set(result.graph.nodes.filter((n) => n.typeOnly).map((n) => n.id));

  const byViaSymbol = new Map<string, BlastCallerRow[]>();
  for (const c of result.projection.callers) {
    const arr = byViaSymbol.get(c.viaSymbol);
    if (arr) arr.push(c);
    else byViaSymbol.set(c.viaSymbol, [c]);
  }

  const facts = result.projection.factsByFile;
  const downstream = [...byViaSymbol.entries()].map(([symbol, all]) => {
    const callers = all.slice(0, MAX_CALLERS_PER_SYMBOL);
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of callers) {
      const f = facts[c.file];
      if (!f) continue;
      for (const e of f.endpoints) endpoints.add(e);
      for (const cr of f.crons) crons.add(cr);
    }
    return {
      symbol,
      callers: callers.map((c) => ({
        name: c.symbol,
        file: c.file,
        line: c.line,
        rank: c.rank,
        ...(typeOnlyIds.has(`${c.file}#${c.symbol}`) || typeOnlyIds.has(c.file) ? { type_only: true } : {}),
      })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
  });

  return { changed_symbols, downstream };
}
