/**
 * Intent data access (infrastructure; implements IntentStore + PullLookup).
 * Owns `pr_intent`; reads `pull_requests`, `repos`, `pr_commits` and
 * `pr_files` directly (the same cross-table reads the reviews module makes in
 * its own `repository/pull.repo.ts` — each module owns the reads it needs).
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { IntentCommit, IntentPull, IntentRecordInput, IntentRepo, IntentStore, PullLookup } from '../application/ports.js';
import { toPrIntentRecord } from './mappers.js';
import type { PrIntentRecord } from '@devdigest/shared';

export class IntentRepository implements IntentStore, PullLookup {
  constructor(private readonly db: Db) {}

  // ---- IntentStore ------------------------------------------------------

  async get(prId: string): Promise<PrIntentRecord | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row?.derivedAt) return undefined; // never derived
    return toPrIntentRecord(row);
  }

  async upsert(record: IntentRecordInput): Promise<PrIntentRecord> {
    const values = {
      prId: record.prId,
      intent: record.intent.intent,
      inScope: record.intent.in_scope,
      outOfScope: record.intent.out_of_scope,
      changeType: record.intent.change_type ?? null,
      confidence: record.intent.confidence ?? null,
      derivedFrom: record.intent.derived_from ?? 'inferred',
      sources: record.intent.sources ?? [],
      headSha: record.headSha,
      inputHash: record.inputHash,
      promptVersion: record.promptVersion,
      provider: record.provider,
      model: record.model,
      tokensIn: record.tokensIn,
      tokensOut: record.tokensOut,
      costUsd: record.costUsd,
      derivedAt: record.derivedAt,
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return toPrIntentRecord(row!);
  }

  // ---- PullLookup ---------------------------------------------------------

  async getPull(workspaceId: string, prId: string): Promise<IntentPull | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      id: row.id,
      repoId: row.repoId,
      number: row.number,
      title: row.title,
      body: row.body,
      branch: row.branch,
      headSha: row.headSha,
    };
  }

  async getRepo(repoId: string): Promise<IntentRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  async getCommits(prId: string): Promise<IntentCommit[]> {
    const rows = await this.db
      .select({ sha: t.prCommits.sha, message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(asc(t.prCommits.committedAt));
    return rows;
  }

  async getChangedFiles(prId: string): Promise<string[]> {
    const rows = await this.db.select({ path: t.prFiles.path }).from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
