"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore, type IconName } from "@devdigest/ui";
import type { RunSummary, PrCommit, ReviewRecord, Severity } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsBySeverityBadge } from "@/components/findings-by-severity";
import { activeFindings, countBySeverity } from "../../../../../../../lib/findings";
import { GO_TO_REVIEW_CLASS, css, s } from "./styles";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done".
 *
 * Blockers are LIVE whenever a persisted review matches the run: the CRITICAL,
 * non-dismissed count recomputed from that review's findings — the exact same
 * definition ReviewRunAccordion uses below. The denormalized `run.blockers`
 * (frozen at completion, and gated by the agent's own `ciFailOn` threshold) is
 * only the fallback for rows with no matching review (failed / cancelled /
 * running, which have no findings to recompute from anyway). Both the outcome
 * colour/label AND the printed "· N blockers" text read that one value, so a
 * row's colour can never contradict its own text.
 */

type Outcome = { key: string; color: string; bg: string; icon: IconName };

/** CRITICAL + non-dismissed from the matched review; else the frozen count. */
export function liveBlockers(run: RunSummary, matchedReview: ReviewRecord | undefined): number {
  if (matchedReview) {
    return matchedReview.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  }
  return run.blockers ?? 0;
}

/** ACTIVE (non-dismissed) findings from the matched review; else the frozen
 *  count — the same fallback shape `liveBlockers` uses. Keeps the amber
 *  "reviewed" outcome from contradicting an empty severity badge on a settled
 *  run whose findings have all been dismissed. */
export function liveFindingsCount(run: RunSummary, matchedReview: ReviewRecord | undefined): number {
  if (matchedReview) return activeFindings(matchedReview.findings).length;
  return run.findings_count ?? 0;
}

function outcomeOf(run: RunSummary, blockers: number, findingsCount: number): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if (blockers > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (findingsCount > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
function tsOf(s2: string | null | undefined): number {
  if (!s2) return 0;
  const n = Date.parse(s2);
  return Number.isNaN(n) ? 0 : n;
}

/** Combined token count for the timeline row, e.g. "9,119 tok". */
function formatRunTokens(tokensIn: number | null, tokensOut: number | null): string {
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  return `${total.toLocaleString()} tok`;
}

/** ms the copy button shows its ✓ before reverting (matches LiveLogStream). */
const COPY_RESET_MS = 1500;

export function RunHistory({
  runs,
  reviews = [],
  commits = [],
  repoId,
  prNumber,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  /** Persisted reviews (with findings), joined to `runs` by `run_id` — lets
   *  each timeline tile show its OWN severity badge, scoped to that one run
   *  only (never aggregated across the rest of the timeline). */
  reviews?: ReviewRecord[];
  commits?: PrCommit[];
  /** Used to build the shareable deep link the copy button writes. */
  repoId?: string;
  prNumber?: number | string;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name
   *  → no severity; clicking a severity chip → that severity's filter too). */
  onGoToReview?: (runId: string, severity?: Severity | null) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  // `kind === "review"` is the same defensive filter PRRow/FindingsTab apply: a
  // "summary"-kind record sharing a run_id must never be picked up as THIS
  // run's review (its findings would then drive the row's badge and blockers).
  const reviewByRunId = React.useMemo(
    () =>
      new Map(
        reviews
          .filter((rv) => rv.kind === "review" && rv.run_id)
          .map((rv) => [rv.run_id as string, rv]),
      ),
    [reviews],
  );
  const [copiedRunId, setCopiedRunId] = React.useState<string | null>(null);

  // Built with `new URL` + searchParams rather than string interpolation:
  // repoId / prNumber come from the route unvalidated, and a raw `&`/`#`/space
  // would silently produce a broken link. (Not an XSS surface — the string only
  // ever reaches clipboard.writeText, never innerHTML/href/location.)
  const copyRunLink = React.useCallback(
    (runId: string) => {
      if (repoId == null || prNumber == null) return;
      const url = new URL(`/repos/${repoId}/pulls/${prNumber}`, window.location.origin);
      url.searchParams.set("tab", "findings");
      url.searchParams.set("agent", runId);
      // The ✓ is proof the clipboard actually took the link: `navigator.clipboard`
      // is undefined outside a secure context, and writeText can reject (no
      // permission / document not focused). Showing success either way lies.
      const write = navigator.clipboard?.writeText(url.toString());
      if (!write) return;
      void write
        .then(() => {
          setCopiedRunId(runId);
          setTimeout(() => setCopiedRunId((cur) => (cur === runId ? null : cur)), COPY_RESET_MS);
        })
        .catch(() => {});
    },
    [repoId, prNumber],
  );

  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={s.wrap}>
      <style>{css}</style>
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          return (
            <div key={`commit:${c.sha}`} style={s.commitRow}>
              <Icon.GitCommit size={15} style={s.commitIcon} />
              <span className="mono" style={s.commitSha}>
                {c.sha.slice(0, 7)}
              </span>
              <span style={s.commitMessage} title={c.message}>
                {c.message.split("\n")[0]}
              </span>
              <span style={s.commitMeta}>{c.author}</span>
              {c.committed_at && (
                <span style={s.commitMeta}>{new Date(c.committed_at).toLocaleTimeString()}</span>
              )}
            </div>
          );
        }

        const r = item.run;
        const matchedReview = reviewByRunId.get(r.run_id);
        const blockers = liveBlockers(r, matchedReview);
        const o = outcomeOf(r, blockers, liveFindingsCount(r, matchedReview));
        const settled = r.status === "done";
        // A settled run that never wrote a trace document has nothing to open;
        // a running one hasn't written it YET, so keep its button live.
        const showTrace = r.status === "running" || r.has_trace !== false;
        return (
          <div key={`run:${r.run_id}`} style={s.row}>
            <Badge color={o.color} bg={o.bg} icon={o.icon}>
              {t(`runStatus.${o.key}`)}
            </Badge>
            {settled && r.score != null && (
              /* Ring colour follows this row's OUTCOME badge, so the two can't
                 disagree (a 0-score "rejected" row was already red; a
                 "reviewed" row must not read red just because it scored low). */
              <CircularScore score={r.score} size={30} stroke={3} colorOverride={o.color} />
            )}
            <div style={s.main}>
              <div style={s.agentLine}>
                <button
                  type="button"
                  className={GO_TO_REVIEW_CLASS}
                  onClick={() => onGoToReview?.(r.run_id)}
                  title={t("timeline.goToReview")}
                  style={s.goToReview(Boolean(onGoToReview))}
                >
                  {r.agent_name ?? "Agent"}
                </button>{" "}
                <span className="mono" style={s.modelText}>
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div style={s.errorText} title={r.error}>
                  {r.error}
                </div>
              )}
              {settled &&
                (!matchedReview ? (
                  // No matching persisted review (e.g. a legacy row) — fall
                  // back to the plain-text denormalized counts on the run row.
                  <div style={s.countsText}>
                    {t("runStatus.findings", { count: r.findings_count ?? 0 })}
                    {blockers > 0 ? t("runStatus.blockers", { count: blockers }) : ""}
                  </div>
                ) : (
                  (() => {
                    const active = activeFindings(matchedReview.findings);
                    return (
                      <FindingsBySeverityBadge
                        counts={countBySeverity(active)}
                        findings={active}
                        compact
                        /* Timeline chip = "go to review, filtered". It navigates
                           away, so it does NOT also pin its own popover. */
                        onSeverityClick={(sev) => onGoToReview?.(r.run_id, sev)}
                      />
                    );
                  })()
                ))}
            </div>
            <div style={s.metaCol}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {settled && (
                <span>
                  {formatRunTokens(r.tokens_in, r.tokens_out)} · <RunCostBadge costUsd={r.cost_usd} />
                </span>
              )}
            </div>
            {repoId != null && prNumber != null && (
              <button
                type="button"
                title={t("timeline.copyLink")}
                aria-label={t("timeline.copyLink")}
                onClick={() => copyRunLink(r.run_id)}
                style={s.iconBtn}
              >
                {copiedRunId === r.run_id ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
              </button>
            )}
            {showTrace && (
              <button
                type="button"
                title={t("timeline.openTrace")}
                aria-label={t("timeline.openTrace")}
                onClick={() => onOpenTrace(r.run_id)}
                style={s.iconBtn}
              >
                <Icon.FileText size={13} />
              </button>
            )}
            {onDelete && r.status !== "running" && (
              <span
                role="button"
                aria-label={t("timeline.deleteRun")}
                title={t("timeline.deleteRun")}
                onClick={() => onDelete(r.run_id)}
                style={s.deleteBtn}
              >
                <Icon.Trash size={13} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
