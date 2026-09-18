/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, RunSummary, Verdict, RepoProvider } from "@devdigest/shared";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { useDeleteReview } from "../../../../../../../lib/hooks/reviews";
import { s, deleteButtonStyle, spinningIconStyle, chevronStyle } from "./styles";

const VERDICT_COLOR: Record<string, string> = {
  request_changes: "var(--crit)",
  comment: "var(--warn)",
  approve: "var(--ok)",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ReviewRunAccordion({
  review,
  run = null,
  prId,
  defaultOpen = false,
  repoFullName,
  repoProvider,
  headSha,
  targetRunId = null,
  targetNonce = 0,
}: {
  review: ReviewRecord;
  /** The agent_runs row behind this review (matched by run_id) — feeds the
   *  cost/token line in the VerdictBanner. Null when no run row is known. */
  run?: RunSummary | null;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  repoProvider?: RepoProvider;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [targetRunId, targetNonce, review.run_id]);
  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  const verdictColor = review.verdict ? VERDICT_COLOR[review.verdict] ?? "var(--text-muted)" : "var(--text-muted)";

  return (
    <div ref={rootRef} id={review.run_id ? `review-run-${review.run_id}` : undefined} style={s.root}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.header}
      >
        <Icon.Cpu size={15} style={s.headerIcon} />
        <span style={s.agentName}>{review.agent_name ?? "Agent"}</span>
        {review.verdict && (
          <Badge color={verdictColor} bg="transparent">
            {review.verdict.replace("_", " ")}
          </Badge>
        )}
        <span style={s.countsText}>
          {findings.length} finding{findings.length === 1 ? "" : "s"}
          {blockers > 0 ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"}` : ""}
        </span>
        <span style={s.spacer} />
        {review.score != null && (
          <Badge mono color="var(--text-secondary)">
            {review.score}
          </Badge>
        )}
        <span className="mono" style={s.when}>
          {formatWhen(review.created_at)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete this "${review.agent_name ?? "agent"}" review run and its findings?`)) {
              del.mutate(review.id);
            }
          }}
          disabled={del.isPending}
          title="Delete this review run"
          aria-label="Delete this review run"
          style={deleteButtonStyle(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? spinningIconStyle : undefined} />
        </button>
        <Icon.ChevronDown size={16} style={chevronStyle(open)} />
      </div>

      {open && (
        <div style={s.body}>
          {review.verdict && (
            <div style={s.verdictWrap}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
                run={
                  run
                    ? { cost_usd: run.cost_usd, tokens_in: run.tokens_in, tokens_out: run.tokens_out }
                    : null
                }
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoFullName={repoFullName}
            repoProvider={repoProvider}
            headSha={headSha}
          />
        </div>
      )}
    </div>
  );
}

export default ReviewRunAccordion;
