import type { BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { BlastCallerRow, BlastResult, DegradedReason, IndexStatus, RepoIntel } from '../repo-intel/types.js';

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
  getPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined>;
  getPrFiles(prId: string): Promise<{ path: string }[]>;
}

/** `GET /pulls/:id/blast` response envelope (specs/07-blast-radius.md §API). */
export interface BlastEnvelope {
  status: IndexStatus;
  degradedReason?: DegradedReason;
  data: BlastRadius;
}

/**
 * Blast Radius application service — thin read, zero LLM calls, entirely
 * compute-on-request over `repo-intel`'s already-fixed persistent index reads.
 */
export class BlastService {
  constructor(
    private prFiles: PrFileLookup,
    private repoIntel: RepoIntel,
  ) {}

  async getBlast(workspaceId: string, prId: string): Promise<BlastEnvelope> {
    const pull = await this.prFiles.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.prFiles.getPrFiles(prId);
    const paths = files.map((f) => f.path);

    const [blast, indexState] = await Promise.all([
      this.repoIntel.getBlastRadius(pull.repoId, paths),
      this.repoIntel.getIndexState(pull.repoId),
    ]);

    const envelope: BlastEnvelope = {
      status: indexState.status,
      data: toBlastRadius(blast),
    };
    const degradedReason = blast.reason ?? indexState.degradedReason;
    if (degradedReason) envelope.degradedReason = degradedReason;
    return envelope;
  }
}

/**
 * Pure mapper: groups the flat `callers[]` into `downstream[]` by `viaSymbol`,
 * attaching each group's `endpoints_affected`/`crons_affected` from the facts
 * of that group's OWN caller files (`factsByFile` is keyed by caller file —
 * see `repo-intel/types.ts`'s `BlastResult.factsByFile` doc comment). No LLM
 * call, so `summary` is left unset (contract has it as `.nullish()`).
 */
function toBlastRadius(result: BlastResult): BlastRadius {
  const changed_symbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const byViaSymbol = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    const arr = byViaSymbol.get(c.viaSymbol);
    if (arr) arr.push(c);
    else byViaSymbol.set(c.viaSymbol, [c]);
  }

  const facts = result.factsByFile ?? {};
  const downstream = [...byViaSymbol.entries()].map(([symbol, callers]) => {
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
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line, rank: c.rank })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
  });

  return { changed_symbols, downstream };
}
