/**
 * pr-brief — Drizzle repository (ring 3a). Owns `pr_brief` and the
 * `kind = 'brief'` rows of `agent_runs` / `run_traces`; reads the PR, its files
 * and its newest review. `pr_brief` has no `workspace_id`, so its reads and
 * writes are scoped through `pull_requests`.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { PrBrief, type RunSummary, type RunTrace } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import * as t from '../../db/schema.js';
import type { NewestReview, PrBriefRepositoryPort, PrFileInfo, PullInfo, RunUsage } from './ports.js';

type RunRow = typeof t.agentRuns.$inferSelect;

/** Postgres SQLSTATE of a driver error (drizzle may wrap it in `cause`). */
const sqlState = (err: unknown): string | undefined => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
};

const toRun = (run: RunRow): RunSummary => ({
  run_id: run.id,
  kind: run.kind,
  agent_id: run.agentId,
  agent_name: null,
  provider: run.provider,
  model: run.model,
  status: run.status,
  error: run.error,
  duration_ms: run.durationMs,
  tokens_in: run.tokensIn,
  tokens_out: run.tokensOut,
  cost_usd: run.costUsd,
  findings_count: run.findingsCount,
  grounding: run.grounding,
  ran_at: run.ranAt ? run.ranAt.toISOString() : null,
  score: run.score,
  blockers: run.blockers,
});

export class PrBriefRepository implements PrBriefRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullInfo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return { id: row.id, number: row.number, title: row.title, branch: row.branch, body: row.body, headSha: row.headSha };
  }

  async getPrFiles(workspaceId: string, prId: string): Promise<PrFileInfo[]> {
    const rows = await this.db
      .select({ f: t.prFiles })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prFiles.prId, prId)));
    return rows.map(({ f }) => ({ path: f.path, additions: f.additions, deletions: f.deletions, patch: f.patch }));
  }

  async getNewestReview(workspaceId: string, prId: string): Promise<NewestReview | undefined> {
    const [row] = await this.db
      .select({ review: t.reviews, agentName: t.agents.name })
      .from(t.reviews)
      .leftJoin(t.agents, eq(t.agents.id, t.reviews.agentId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!row) return undefined;
    const open = await this.db
      .select()
      .from(t.findings)
      .where(and(eq(t.findings.reviewId, row.review.id), isNull(t.findings.dismissedAt)));
    const verdict = row.review.verdict;
    return {
      facts: {
        review_id: row.review.id,
        run_id: row.review.runId,
        agent_name: row.agentName ?? null,
        verdict: verdict === 'request_changes' || verdict === 'approve' || verdict === 'comment' ? verdict : null,
        score: row.review.score,
        findings_count: open.length,
        blockers: open.filter((f) => f.severity === 'CRITICAL').length,
        created_at: row.review.createdAt.toISOString(),
      },
      findings: open.map((f) => ({
        title: f.title,
        severity: f.severity,
        file: f.file,
        startLine: f.startLine,
        endLine: f.endLine,
        rationale: f.rationale,
      })),
    };
  }

  async getLatestRun(workspaceId: string, prId: string): Promise<RunSummary | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId), eq(t.agentRuns.kind, 'brief')))
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(1);
    return row ? toRun(row) : undefined;
  }

  async getStored(workspaceId: string, prId: string): Promise<PrBrief | null> {
    const [row] = await this.db
      .select({ b: t.prBrief })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prBrief.prId, prId)));
    if (!row) return null;
    const b = row.b;
    const json = (b.json ?? {}) as { summary?: unknown; risks?: unknown; review_focus?: unknown };
    const parsed = PrBrief.safeParse({
      summary: json.summary,
      risks: json.risks,
      review_focus: json.review_focus,
      generated_at: b.generatedAt?.toISOString(),
      provider: b.provider,
      model: b.model,
      tokens_in: b.tokensIn,
      tokens_out: b.tokensOut,
      cost_usd: b.costUsd,
      head_sha: b.headSha,
      source_review_id: b.sourceReviewId,
      run_id: b.runId,
      files_total: b.filesTotal,
      files_included: b.filesIncluded,
    });
    return parsed.success ? parsed.data : null;
  }

  async createRun(workspaceId: string, prId: string, model: { provider: string; model: string }): Promise<RunSummary> {
    try {
      const [row] = await this.db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: null,
          prId,
          kind: 'brief',
          provider: model.provider,
          model: model.model,
          status: 'running',
          source: 'local',
        })
        .returning();
      return toRun(row!);
    } catch (err) {
      // Partial unique index `agent_runs_one_running_brief_uidx`: a brief is already running for this PR.
      if (sqlState(err) === '23505') throw new ConflictError('A brief is already being generated for this pull request');
      throw err;
    }
  }

  async failRun(workspaceId: string, runId: string, error: string, usage: RunUsage = {}): Promise<void> {
    await this.db
      .update(t.agentRuns)
      .set({
        status: 'failed',
        error,
        ...(usage.durationMs !== undefined ? { durationMs: usage.durationMs } : {}),
        ...(usage.tokensIn !== undefined ? { tokensIn: usage.tokensIn } : {}),
        ...(usage.tokensOut !== undefined ? { tokensOut: usage.tokensOut } : {}),
        ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
      })
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.id, runId)));
  }

  async completeRun(
    workspaceId: string,
    prId: string,
    runId: string,
    brief: PrBrief,
    usage: RunUsage,
    trace: RunTrace,
  ): Promise<void> {
    try {
      await this.writeCompletion(workspaceId, prId, runId, brief, usage, trace);
    } catch (err) {
      // The pull request (and its pr_brief row) was removed mid-run.
      if (sqlState(err) === '23503') throw new NotFoundError('Pull request not found');
      throw err;
    }
  }

  private async writeCompletion(
    workspaceId: string,
    prId: string,
    runId: string,
    brief: PrBrief,
    usage: RunUsage,
    trace: RunTrace,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const values = {
        json: { summary: brief.summary, risks: brief.risks, review_focus: brief.review_focus },
        generatedAt: new Date(brief.generated_at),
        provider: brief.provider,
        model: brief.model,
        tokensIn: brief.tokens_in,
        tokensOut: brief.tokens_out,
        costUsd: brief.cost_usd,
        headSha: brief.head_sha,
        sourceReviewId: brief.source_review_id,
        runId,
        filesTotal: brief.files_total,
        filesIncluded: brief.files_included,
      };
      await tx
        .insert(t.prBrief)
        .values({ prId, ...values })
        .onConflictDoUpdate({ target: t.prBrief.prId, set: values });
      await tx
        .update(t.agentRuns)
        .set({
          status: 'done',
          error: null,
          durationMs: usage.durationMs ?? null,
          tokensIn: brief.tokens_in,
          tokensOut: brief.tokens_out,
          costUsd: brief.cost_usd,
          findingsCount: 0,
          grounding: trace.stats.grounding,
        })
        .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.id, runId)));
      await tx
        .insert(t.runTraces)
        .values({ runId, trace })
        .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
    });
  }

  async saveTrace(workspaceId: string, runId: string, trace: RunTrace): Promise<void> {
    // Scoped through agent_runs: a run id of another workspace writes nothing.
    const [run] = await this.db
      .select({ id: t.agentRuns.id })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.id, runId)));
    if (!run) return;
    await this.db
      .insert(t.runTraces)
      .values({ runId, trace })
      .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
  }
}
