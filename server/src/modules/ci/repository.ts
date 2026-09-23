import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentRunRow } from '../../db/rows.js';
import type { RunTrace } from '@devdigest/shared';

/**
 * specs/14-export-to-ci.md — the ONLY file in `modules/ci/` allowed to
 * import `src/db/**` (`db-only-in-repositories`). Owns `ci_installations`
 * and `ci_runs` CRUD, the CI-sourced `agent_runs`/`run_traces` writes (D7),
 * and the Agent Performance aggregation (AC-41…AC-46) — kept here rather
 * than a sibling `performance.ts` because only a file matching
 * `repository\.ts$` may import `src/db/**`
 * (`server/.dependency-cruiser.cjs:51-62`).
 */

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;
export type CiRunRow = typeof t.ciRuns.$inferSelect;

// Mirrors `db/schema/ci.ts`'s `ci_runs.status` enum (Phase A2, tightened
// from free text) — a local literal tuple, not an import of the shared
// `CiRunStatus` zod enum, so a querystring-supplied filter value can be
// checked against the DB column's actual enum before ever reaching `eq()`.
const CI_RUN_STATUS_VALUES = ['succeeded', 'failed', 'no_findings', 'running'] as const;

export interface InsertCiInstallation {
  workspaceId: string;
  agentId: string;
  repo: string;
  targetType: 'gha' | 'circle' | 'jenkins' | 'cli';
  branch: string;
  base: string;
  workflowPath: string;
  postAs: 'github_review' | 'pr_comment' | 'none';
  triggers: string[];
}

export interface UpdateCiInstallationAfterExport {
  prUrl: string | null;
  lastExportAt: Date;
  postAs?: 'github_review' | 'pr_comment' | 'none';
  triggers?: string[];
}

export interface UpsertCiRun {
  workspaceId: string;
  ciInstallationId: string | null;
  // Plan 14 Phase A2 — denormalised from the installation (D-P3's orphan
  // edge case: a run must still render its repository after the
  // installation cascades away). Written once at ingest time, never
  // re-derived from a join.
  repo: string;
  providerRunId: string;
  prNumber: number | null;
  prTitle: string | null;
  prUrl: string | null;
  commitSha: string | null;
  agentName: string | null;
  ranAt: Date | null;
  status: 'succeeded' | 'failed' | 'no_findings' | 'running';
  findingsCount: number | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  costUsd: number | null;
  durationMs: number | null;
  durationSource: 'artifact' | 'provider' | null;
  githubUrl: string | null;
  source: string;
  failureReason: string | null;
  agentRunId: string | null;
  ingestedAt: Date;
}

export interface CiRunFilters {
  from?: Date;
  to?: Date;
  agentId?: string;
  repo?: string;
  status?: string;
  source?: string;
}

export interface InsertCiAgentRun {
  workspaceId: string;
  agentId: string | null;
  prId: string | null;
  provider: string | null;
  model: string | null;
  ranAt: Date | null;
  status: 'done' | 'failed';
  durationMs: number | null;
  costUsd: number | null;
  findingsCount: number | null;
  error: string | null;
}

/**
 * specs/16-agent-performance-dashboard.md — widened for D1 (separate counted/
 * costed/timed denominators), D2 (findings windowed by the run's own ranAt),
 * cost provenance (`cost_source`) sub-totals, `pending` findings, and a
 * per-day run count for the trend sparkline. Structurally satisfies
 * `modules/_shared/perf.ts`'s `PerfSourceRow` — that file's own type is a
 * LOCAL mirror (not an import of this one; `no-cross-module`), so keep the
 * two shapes in sync by hand when either changes.
 */
export interface PerfRangeRow {
  agentId: string;
  runsLocal: number;
  runsCi: number;
  /** `status === 'done'` — excludes running/failed from the avg-latency
   *  denominator (D1). */
  countedRuns: number;
  /** Non-null `costUsd` — the `avg_cost_usd` denominator (D1). */
  costedRuns: number;
  /** Non-null `durationMs` — the `avg_latency_ms` denominator (D1). */
  timedRuns: number;
  totalCostUsd: number | null;
  totalDurationMs: number | null;
  totalFindings: number;
  lastRunAt: Date | null;
  accepted: number;
  dismissed: number;
  /** Findings with neither `acceptedAt` nor `dismissedAt` — previously
   *  excluded from every denominator and invisible anywhere. */
  pending: number;
  /** Dollar sub-totals by `cost_source`; `null` when that bucket had zero
   *  costed runs (null-is-not-zero, never a fabricated $0.00). */
  costProvider: number | null;
  costEstimated: number | null;
  costUnknown: number | null;
  /** Run count per UTC day (`YYYY-MM-DD`) — bucketed into the sparkline by
   *  `_shared/perf.ts`'s `dailyTrend`/`dailyTrendPoints`. */
  runsByDay: { day: string; count: number }[];
}

export class CiRepository {
  constructor(private db: Db) {}

  // ---- ci_installations (P3) ---------------------------------------------

  async insertInstallation(values: InsertCiInstallation): Promise<CiInstallationRow> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        repo: values.repo,
        targetType: values.targetType,
        branch: values.branch,
        base: values.base,
        workflowPath: values.workflowPath,
        postAs: values.postAs,
        triggers: values.triggers,
      })
      .returning();
    return row!;
  }

  /** AC-7 — the exact (agent, repo, target) tuple a republish reuses. */
  async getInstallationByTuple(
    workspaceId: string,
    agentId: string,
    repo: string,
    targetType: string,
  ): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(
        and(
          eq(t.ciInstallations.workspaceId, workspaceId),
          eq(t.ciInstallations.agentId, agentId),
          eq(t.ciInstallations.repo, repo),
          eq(t.ciInstallations.targetType, targetType as 'gha'),
        ),
      );
    return row;
  }

  /** AC-59 — ANY existing installation for this repo, regardless of agent. */
  async getInstallationByRepo(
    workspaceId: string,
    repo: string,
  ): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.repo, repo)));
    return row;
  }

  async getInstallationById(
    workspaceId: string,
    id: string,
  ): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.id, id)));
    return row;
  }

  async listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallationRow[]> {
    return this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)));
  }

  async listInstallationsForWorkspace(workspaceId: string): Promise<CiInstallationRow[]> {
    return this.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.workspaceId, workspaceId));
  }

  async updateInstallationAfterExport(
    id: string,
    values: UpdateCiInstallationAfterExport,
  ): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({
        prUrl: values.prUrl,
        lastExportAt: values.lastExportAt,
        ...(values.postAs ? { postAs: values.postAs } : {}),
        ...(values.triggers ? { triggers: values.triggers } : {}),
      })
      .where(eq(t.ciInstallations.id, id));
  }

  // ---- ci_runs (P4) -------------------------------------------------------

  /** AC-19 — idempotent upsert keyed on (workspace_id, provider_run_id),
   *  backed by the unique index in `db/schema/ci.ts`. Repeated refreshes of
   *  the same provider run converge on one row. */
  async upsertRun(values: UpsertCiRun): Promise<CiRunRow> {
    const [row] = await this.db
      .insert(t.ciRuns)
      .values({
        workspaceId: values.workspaceId,
        ciInstallationId: values.ciInstallationId,
        repo: values.repo,
        providerRunId: values.providerRunId,
        prNumber: values.prNumber,
        prTitle: values.prTitle,
        prUrl: values.prUrl,
        commitSha: values.commitSha,
        agentName: values.agentName,
        ranAt: values.ranAt,
        status: values.status,
        findingsCount: values.findingsCount,
        critical: values.critical,
        warning: values.warning,
        suggestion: values.suggestion,
        costUsd: values.costUsd,
        durationMs: values.durationMs,
        durationSource: values.durationSource,
        githubUrl: values.githubUrl,
        source: values.source,
        failureReason: values.failureReason,
        agentRunId: values.agentRunId,
        ingestedAt: values.ingestedAt,
      })
      .onConflictDoUpdate({
        target: [t.ciRuns.workspaceId, t.ciRuns.providerRunId],
        set: {
          ciInstallationId: values.ciInstallationId,
          repo: values.repo,
          prNumber: values.prNumber,
          prTitle: values.prTitle,
          prUrl: values.prUrl,
          commitSha: values.commitSha,
          agentName: values.agentName,
          ranAt: values.ranAt,
          status: values.status,
          findingsCount: values.findingsCount,
          critical: values.critical,
          warning: values.warning,
          suggestion: values.suggestion,
          costUsd: values.costUsd,
          durationMs: values.durationMs,
          durationSource: values.durationSource,
          githubUrl: values.githubUrl,
          source: values.source,
          failureReason: values.failureReason,
          agentRunId: values.agentRunId,
          ingestedAt: values.ingestedAt,
        },
      })
      .returning();
    return row!;
  }

  /** AC-28 — date range / agent / repository / status / source filters
   *  applied together. Joins `ci_installations` only to filter by `repo`
   *  (a `ci_runs` row's own `ci_installation_id` can be null — orphaned). */
  async listRuns(workspaceId: string, filters: CiRunFilters = {}): Promise<CiRunRow[]> {
    const conditions = [eq(t.ciRuns.workspaceId, workspaceId)];
    if (filters.from) conditions.push(gte(t.ciRuns.ranAt, filters.from));
    if (filters.to) conditions.push(sql`${t.ciRuns.ranAt} <= ${filters.to}`);
    // `status` is now a NOT NULL enum column (Phase A2) — a status filter
    // value outside the enum can never match a real row, so it's dropped
    // rather than cast unchecked into `eq`.
    if (filters.status && (CI_RUN_STATUS_VALUES as readonly string[]).includes(filters.status)) {
      conditions.push(eq(t.ciRuns.status, filters.status as (typeof CI_RUN_STATUS_VALUES)[number]));
    }
    if (filters.source) conditions.push(eq(t.ciRuns.source, filters.source));

    if (filters.agentId || filters.repo) {
      const rows = await this.db
        .select({ run: t.ciRuns, installation: t.ciInstallations })
        .from(t.ciRuns)
        .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
        .where(and(...conditions))
        .orderBy(desc(t.ciRuns.ranAt));
      return rows
        .filter((r) => {
          if (filters.agentId && r.installation?.agentId !== filters.agentId) return false;
          if (filters.repo && r.installation?.repo !== filters.repo) return false;
          return true;
        })
        .map((r) => r.run);
    }

    return this.db
      .select()
      .from(t.ciRuns)
      .where(and(...conditions))
      .orderBy(desc(t.ciRuns.ranAt));
  }

  async getRunById(workspaceId: string, id: string): Promise<CiRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciRuns)
      .where(and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.id, id)));
    return row;
  }

  /** AC-19's idempotency pre-check — lets the caller reuse the SAME
   *  `agent_run_id` on a re-ingest instead of writing a second `agent_runs`
   *  row every refresh (the `ci_runs` row itself is already deduplicated by
   *  `upsertRun`'s unique index; this is what makes the paired `agent_runs`
   *  write idempotent too). */
  async getRunByProviderRunId(
    workspaceId: string,
    providerRunId: string,
  ): Promise<CiRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciRuns)
      .where(and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.providerRunId, providerRunId)));
    return row;
  }

  /** AC-36 — for each installation, its most recently ingested run. */
  async lastRunPerInstallation(
    workspaceId: string,
    installationIds: string[],
  ): Promise<Map<string, CiRunRow>> {
    if (installationIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(t.ciRuns)
      .where(eq(t.ciRuns.workspaceId, workspaceId))
      .orderBy(desc(t.ciRuns.ranAt));
    const byInstallation = new Map<string, CiRunRow>();
    for (const row of rows) {
      if (!row.ciInstallationId || !installationIds.includes(row.ciInstallationId)) continue;
      if (!byInstallation.has(row.ciInstallationId)) byInstallation.set(row.ciInstallationId, row);
    }
    return byInstallation;
  }

  // ---- agent_runs / run_traces — D7's CI-sourced write -------------------

  /** D7/AC-20 — the `agent_runs` row a CI ingest ALSO writes, `source: 'ci'`,
   *  so every existing cost/latency aggregation reads it for free. Written
   *  directly here (not through `modules/reviews/*`) — `agent_runs` is a
   *  cross-cutting table and this file is this module's own `repository.ts`,
   *  which `db-only-in-repositories` already permits to touch `src/db/**`. */
  async insertCiAgentRun(values: InsertCiAgentRun): Promise<AgentRunRow> {
    const [row] = await this.db
      .insert(t.agentRuns)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        prId: values.prId,
        ranAt: values.ranAt ?? undefined,
        provider: values.provider,
        model: values.model,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        status: values.status,
        error: values.error,
        source: 'ci',
        findingsCount: values.findingsCount,
      })
      .returning();
    return row!;
  }

  /** AC-19's re-ingest path — update the SAME `agent_runs` row rather than
   *  inserting a second one. */
  async updateCiAgentRun(id: string, values: InsertCiAgentRun): Promise<AgentRunRow> {
    const [row] = await this.db
      .update(t.agentRuns)
      .set({
        ranAt: values.ranAt ?? undefined,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        status: values.status,
        error: values.error,
        findingsCount: values.findingsCount,
      })
      .where(eq(t.agentRuns.id, id))
      .returning();
    return row!;
  }

  async insertRunTrace(runId: string, trace: RunTrace): Promise<void> {
    await this.db
      .insert(t.runTraces)
      .values({ runId, trace })
      .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
  }

  // ---- Agent Performance aggregation (AC-41…AC-46) ------------------------

  /**
   * One row per agent with `agent_runs` in `[from, to)`, aggregated WITHOUT
   * filtering on `source` (AC-45 — `local` and `ci` both count for runs,
   * cost, duration, findings). `accepted`/`dismissed`/`pending` are joined
   * through `reviews.run_id` AND windowed by the RUN's own `ranAt` (via a
   * join to `agent_runs`, not `reviews.createdAt` — D2: a run just inside the
   * period whose review committed just outside it must not silently lose its
   * findings). Only local runs ever produce a review, so a CI-only agent's
   * `accepted`/`dismissed` both land at 0 — the service layer turns that into
   * `accept_rate: null`, never `0`, per AC-46.
   *
   * `agentId` scopes to a single agent — the per-agent Stats tab
   * (`GET /agents/:id/stats`) reuses this SAME query rather than a separate
   * one, so AC-1's "same API, same rules" holds by construction.
   */
  async performanceRows(workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRangeRow[]> {
    const runConditions = [
      eq(t.agentRuns.workspaceId, workspaceId),
      gte(t.agentRuns.ranAt, from),
      lte(t.agentRuns.ranAt, to),
    ];
    if (agentId) runConditions.push(eq(t.agentRuns.agentId, agentId));

    const runRows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        source: t.agentRuns.source,
        status: t.agentRuns.status,
        costUsd: t.agentRuns.costUsd,
        costSource: t.agentRuns.costSource,
        durationMs: t.agentRuns.durationMs,
        findingsCount: t.agentRuns.findingsCount,
        ranAt: t.agentRuns.ranAt,
        runId: t.agentRuns.id,
      })
      .from(t.agentRuns)
      .where(and(...runConditions));

    // D2 — windowed by the RUN's own ranAt (joined via agent_runs), not
    // reviews.createdAt. The inner join to agent_runs also naturally drops
    // any review with a null run_id (summary-kind reviews) — same effect as
    // the pre-existing `if (!f.runId) continue` guard below, kept for safety.
    const findingRows = await this.db
      .select({
        runId: t.reviews.runId,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.agentRuns, eq(t.reviews.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, from),
          lte(t.agentRuns.ranAt, to),
        ),
      );

    const acceptedByRun = new Map<string, number>();
    const dismissedByRun = new Map<string, number>();
    const pendingByRun = new Map<string, number>();
    for (const f of findingRows) {
      if (!f.runId) continue;
      if (f.acceptedAt) acceptedByRun.set(f.runId, (acceptedByRun.get(f.runId) ?? 0) + 1);
      else if (f.dismissedAt) dismissedByRun.set(f.runId, (dismissedByRun.get(f.runId) ?? 0) + 1);
      else pendingByRun.set(f.runId, (pendingByRun.get(f.runId) ?? 0) + 1);
    }

    const byAgent = new Map<string, PerfRangeRow>();
    const dayCounts = new Map<string, Map<string, number>>();
    for (const r of runRows) {
      if (!r.agentId) continue;
      const entry = byAgent.get(r.agentId) ?? {
        agentId: r.agentId,
        runsLocal: 0,
        runsCi: 0,
        countedRuns: 0,
        costedRuns: 0,
        timedRuns: 0,
        totalCostUsd: null,
        totalDurationMs: null,
        totalFindings: 0,
        lastRunAt: null,
        accepted: 0,
        dismissed: 0,
        pending: 0,
        costProvider: null,
        costEstimated: null,
        costUnknown: null,
        runsByDay: [],
      };
      if (r.source === 'ci') entry.runsCi += 1;
      else entry.runsLocal += 1;
      if (r.status === 'done') entry.countedRuns += 1;
      if (r.costUsd != null) {
        entry.costedRuns += 1;
        entry.totalCostUsd = (entry.totalCostUsd ?? 0) + r.costUsd;
        if (r.costSource === 'provider') entry.costProvider = (entry.costProvider ?? 0) + r.costUsd;
        else if (r.costSource === 'estimated') entry.costEstimated = (entry.costEstimated ?? 0) + r.costUsd;
        else entry.costUnknown = (entry.costUnknown ?? 0) + r.costUsd;
      }
      if (r.durationMs != null) {
        entry.timedRuns += 1;
        entry.totalDurationMs = (entry.totalDurationMs ?? 0) + r.durationMs;
      }
      if (r.findingsCount != null) entry.totalFindings += r.findingsCount;
      if (!entry.lastRunAt || (r.ranAt && r.ranAt > entry.lastRunAt)) entry.lastRunAt = r.ranAt;
      entry.accepted += acceptedByRun.get(r.runId) ?? 0;
      entry.dismissed += dismissedByRun.get(r.runId) ?? 0;
      entry.pending += pendingByRun.get(r.runId) ?? 0;
      if (r.ranAt) {
        const byDay = dayCounts.get(r.agentId) ?? new Map<string, number>();
        const day = r.ranAt.toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
        dayCounts.set(r.agentId, byDay);
      }
      byAgent.set(r.agentId, entry);
    }
    return [...byAgent.values()].map((entry) => ({
      ...entry,
      runsByDay: [...(dayCounts.get(entry.agentId) ?? new Map()).entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day, count })),
    }));
  }

  /** Cost broken down by model, over `[from, to)` — for AC-44's "by model"
   *  donut. `local` and `ci` both count (AC-45). */
  async costByModel(workspaceId: string, from: Date, to: Date): Promise<{ model: string; cost: number }[]> {
    const rows = await this.db
      .select({ model: t.agentRuns.model, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(
        and(eq(t.agentRuns.workspaceId, workspaceId), gte(t.agentRuns.ranAt, from), lte(t.agentRuns.ranAt, to)),
      );
    const byModel = new Map<string, number>();
    for (const r of rows) {
      if (r.costUsd == null) continue;
      const key = r.model ?? 'unknown';
      byModel.set(key, (byModel.get(key) ?? 0) + r.costUsd);
    }
    return [...byModel.entries()].map(([model, cost]) => ({ model, cost }));
  }
}
