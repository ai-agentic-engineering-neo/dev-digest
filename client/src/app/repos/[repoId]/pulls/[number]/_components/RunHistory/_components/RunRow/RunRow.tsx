"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsSummary } from "@/app/repos/[repoId]/pulls/_components/FindingsSummary";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import { outcomeOf } from "../../helpers";
import { s, agentNameButtonStyle } from "./styles";

/** One agent-run row in the PR timeline. Failed runs show their error inline;
 *  clicking the agent name jumps to the run's inline review accordion below. */
export function RunRow({
  run: r,
  runFindings,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  /** This run's findings (by run_id) — drives the per-severity count chips. */
  runFindings?: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(r);
  const settled = r.status === "done";
  const blockers = r.blockers ?? 0;

  return (
    <div style={s.row}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={s.main}>
        <div style={s.titleRow}>
          <button
            type="button"
            onClick={() => onGoToReview?.(r.run_id)}
            title={t("timeline.goToReview")}
            style={agentNameButtonStyle(Boolean(onGoToReview))}
          >
            {r.agent_name ?? "Agent"}
          </button>{" "}
          <span className="mono" style={s.agentModel}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div style={s.error} title={r.error}>
            {r.error}
          </div>
        )}
        {settled && (
          <div style={s.findingsRow}>
            {runFindings ? (
              <FindingsSummary findings={runFindings} />
            ) : (
              <span>{t("runStatus.findings", { count: r.findings_count ?? 0 })}</span>
            )}
            {blockers > 0 && <span>{t("runStatus.blockers", { count: blockers })}</span>}
          </div>
        )}
      </div>
      <div style={s.trailingCol}>
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
        {settled && (
          <RunCostBadge variant="timeline" costUsd={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
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
}
