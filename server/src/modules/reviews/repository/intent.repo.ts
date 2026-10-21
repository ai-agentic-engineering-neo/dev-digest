/**
 * reviews: intent persistence (ring 3a). Owns `pr_intent`; scopes every call
 * to the workspace through `pull_requests`; maps rows to the port's DTOs.
 */
import { and, desc, eq } from 'drizzle-orm';
import { IntentSource } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type {
  IntentInputs,
  IntentRepositoryPort,
  SaveIntentInput,
  StoredIntent,
} from '../ports.js';

type IntentRow = typeof t.prIntent.$inferSelect;

/** Validate stored sources on read; entries that no longer match the contract are dropped. */
const parseSources = (raw: unknown): IntentSource[] =>
  Array.isArray(raw)
    ? raw.flatMap((e) => {
        const p = IntentSource.safeParse(e);
        return p.success ? [p.data] : [];
      })
    : [];

const toStored = (r: IntentRow): StoredIntent => ({
  prId: r.prId,
  intent: r.intent,
  inScope: r.inScope,
  outOfScope: r.outOfScope,
  confidence: r.confidence,
  sources: parseSources(r.sources),
  sourceHash: r.sourceHash,
  headSha: r.headSha,
  provider: r.provider,
  model: r.model,
  tokensIn: r.tokensIn,
  tokensOut: r.tokensOut,
  costUsd: r.costUsd,
  durationMs: r.durationMs,
  derivedAt: r.derivedAt,
});

export class IntentRepository implements IntentRepositoryPort {
  constructor(private readonly db: Db) {}

  async getInputs(workspaceId: string, prId: string): Promise<IntentInputs | undefined> {
    const [row] = await this.db
      .select({ pr: t.pullRequests, owner: t.repos.owner, name: t.repos.name })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const commits = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(desc(t.prCommits.committedAt));
    const files = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return {
      prId,
      owner: row.owner,
      repoName: row.name,
      number: row.pr.number,
      title: row.pr.title,
      body: row.pr.body,
      branch: row.pr.branch,
      headSha: row.pr.headSha,
      commits: commits.map((c) => c.message),
      changedPaths: files.map((f) => f.path),
    };
  }

  async get(workspaceId: string, prId: string): Promise<StoredIntent | undefined> {
    const [row] = await this.db
      .select({ intent: t.prIntent })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prIntent.prId, prId)));
    return row ? toStored(row.intent) : undefined;
  }

  async save(workspaceId: string, prId: string, v: SaveIntentInput): Promise<StoredIntent | undefined> {
    const [owned] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!owned) return undefined;
    const values = {
      intent: v.intent,
      inScope: v.inScope,
      outOfScope: v.outOfScope,
      confidence: v.confidence,
      sources: v.sources,
      sourceHash: v.sourceHash,
      headSha: v.headSha,
      provider: v.provider,
      model: v.model,
      tokensIn: v.tokensIn,
      tokensOut: v.tokensOut,
      costUsd: v.costUsd,
      durationMs: v.durationMs,
      derivedAt: v.derivedAt,
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return row ? toStored(row) : undefined;
  }
}
