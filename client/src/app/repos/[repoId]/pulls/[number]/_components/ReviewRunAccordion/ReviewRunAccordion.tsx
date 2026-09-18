/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest.

   A run either produced a review or FAILED (a failed run writes no
   ReviewRecord at all), so the row is a discriminated union: the type system
   enforces "exactly one of review / failed run", instead of two loose props
   that could disagree. */
"use client";

import React from "react";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, RunSummary, Severity } from "@devdigest/shared";
import { FindingsBySeverityBadge } from "@/components/findings-by-severity";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { VERDICT_META } from "../VerdictBanner/constants";
import { useDeleteReview } from "../../../../../../../lib/hooks/reviews";
import { activeFindings, countBySeverity, effectiveVerdict } from "../../../../../../../lib/findings";
import { s } from "./styles";

/** Exactly one of "this run produced a review" / "this run failed". */
export type ReviewRunRow =
  | { kind: "review"; review: ReviewRecord }
  | { kind: "failed"; run: RunSummary };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ReviewRunAccordion({
  row,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
  hasTrace = false,
  costUsd,
  initialSeverity = null,
  focusNonce = 0,
  onOpen,
  onOpenTrace,
  onSeverityClick,
  onFilterChange,
}: {
  row: ReviewRunRow;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches the row's run_id, the accordion opens and scrolls into
   *  view (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
  /** A run_traces document exists for this run — gates the trace button. */
  hasTrace?: boolean;
  /** The run's own cost (from its RunSummary); omitted when unknown. */
  costUsd?: number | null;
  /** Seed/re-trigger the body's severity filter (deep link / Timeline chip). */
  initialSeverity?: Severity | null;
  focusNonce?: number;
  /** Fired only on the closed → open transition (never on collapse). */
  onOpen?: (runId: string) => void;
  onOpenTrace?: (runId: string) => void;
  /** A severity chip in THIS header was clicked — the parent syncs the URL.
   *  The header badge also keeps its own pin/narrow (see the badge's docs). */
  onSeverityClick?: (sev: Severity) => void;
  /** The expanded body's severity pills changed the filter (user action) —
   *  the parent mirrors it into the URL's `severity` param. */
  onFilterChange?: (sev: Severity | null) => void;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const review = row.kind === "review" ? row.review : null;
  const failedRun = row.kind === "failed" ? row.run : null;
  const runId = review?.run_id ?? failedRun?.run_id ?? null;
  const agentName = review?.agent_name ?? failedRun?.agent_name ?? "Agent";
  const when = review?.created_at ?? failedRun?.ran_at ?? null;

  React.useEffect(() => {
    if (runId && runId === targetRunId) {
      setOpen(true);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [targetRunId, targetNonce, runId]);

  const del = useDeleteReview(prId);
  const findings = React.useMemo(() => review?.findings ?? [], [review]);
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  // Header badge counts ACTIVE (non-dismissed) findings — the popover-surface
  // convention. The plain "N findings" text beside it stays a total including
  // dismissed ones; the two are deliberately different (see docs/README.md).
  const active = React.useMemo(() => activeFindings(findings), [findings]);
  const activeCounts = React.useMemo(() => countBySeverity(active), [active]);

  // Derived from the findings, NOT `review.verdict` (the model's self-report,
  // which can survive after grounding dropped every finding it was based on).
  const verdict = review ? effectiveVerdict(findings) : null;
  const verdictColor = verdict ? VERDICT_META[verdict].c : "var(--text-muted)";

  // The next value is computed from `open` HERE, not inside the updater: React
  // intentionally double-invokes state updaters under StrictMode (which this
  // app enables), so a side effect in there fires `onOpen` — and the
  // `router.replace()` it bubbles up to — twice per click in dev.
  const toggle = () => {
    const next = !open;
    if (next && runId) onOpen?.(runId);
    setOpen(next);
  };

  return (
    <div ref={rootRef} id={runId ? `review-run-${runId}` : undefined} style={s.root}>
      <div style={s.header}>
        <Icon.Cpu size={15} style={s.agentIcon} />
        <span style={s.agentName}>{agentName}</span>
        {row.kind === "failed" ? (
          <Badge color="var(--crit)" bg="transparent" icon="XCircle">
            Failed
          </Badge>
        ) : (
          verdict && (
            <Badge color={verdictColor} bg="transparent">
              {verdict.replace("_", " ")}
            </Badge>
          )
        )}
        {row.kind === "review" && (
          <>
            <span style={s.countsText}>
              {findings.length} finding{findings.length === 1 ? "" : "s"}
              {blockers > 0 ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"}` : ""}
            </span>
            {/* `compact` drops the visible severity NAME (icon + count only) —
                required so this header badge can't collide with the
                FindingsPanel severity-pill locators below it. */}
            <FindingsBySeverityBadge
              counts={activeCounts}
              findings={active}
              compact
              pinOnClick
              onSeverityClick={onSeverityClick}
            />
          </>
        )}
        <span style={s.spacer} />
        {review?.score != null && (
          <span className="mono tnum" data-testid="run-score" style={s.score(verdictColor)}>
            {review.score}
          </span>
        )}
        {costUsd != null && <RunCostBadge costUsd={costUsd} />}
        {when && (
          <span className="mono" style={s.when}>
            {formatWhen(when)}
          </span>
        )}
        {hasTrace && runId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTrace?.(runId);
            }}
            title="View agent run trace"
            aria-label="View agent run trace"
            style={s.traceBtn}
          >
            <Icon.PanelRight size={14} />
            trace
          </button>
        )}
        {review && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete this "${review.agent_name ?? "agent"}" review run and its findings?`)) {
                del.mutate(review.id);
              }
            }}
            disabled={del.isPending}
            title="Delete this review run"
            aria-label="Delete this review run"
            style={s.iconBtn(del.isPending)}
          >
            <Icon.Trash size={14} style={del.isPending ? s.spin : undefined} />
          </button>
        )}
        {/* The ONLY expand/collapse control. */}
        <button
          type="button"
          onClick={toggle}
          title={open ? "Collapse this run" : "Expand this run"}
          aria-label={open ? "Collapse this run" : "Expand this run"}
          aria-expanded={open}
          style={s.iconBtn()}
        >
          <Icon.ChevronDown size={16} style={s.chevron(open)} />
        </button>
      </div>

      {open && (
        <div style={s.body}>
          {row.kind === "failed" ? (
            failedRun?.error ? (
              <div style={s.errorText} title={failedRun.error}>
                {failedRun.error}
              </div>
            ) : (
              <div style={s.errorText}>This run failed without reporting an error.</div>
            )
          ) : (
            <>
              {review && verdict && (
                <div style={s.bannerWrap}>
                  <VerdictBanner
                    verdict={verdict}
                    summary={review.summary}
                    score={review.score}
                    findingsCount={findings.length}
                    blockers={blockers}
                    agentName={review.agent_name}
                  />
                </div>
              )}
              <FindingsPanel
                findings={findings}
                prId={prId}
                repoFullName={repoFullName}
                headSha={headSha}
                initialSeverity={initialSeverity}
                focusNonce={focusNonce}
                onSeverityFilterChange={onFilterChange}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ReviewRunAccordion;
