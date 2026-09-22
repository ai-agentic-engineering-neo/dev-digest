/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. The header toggle and
   the delete action are sibling buttons (no nested interactive content). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { CostText } from "@/components/cost-text";
import { useDeleteReview } from "@/lib/hooks/reviews";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { KNOWN_VERDICTS, VERDICT_COLOR, VERDICT_COLOR_FALLBACK } from "./constants";
import { countBlockers, formatWhen } from "./helpers";
import { s } from "./styles";

interface ReviewRunAccordionProps {
  review: ReviewRecord;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
  /** Whether this run's FindingsPanel owns the j/k/a/d shortcuts. */
  active?: boolean;
  /** Ask the parent to make this run the keyboard-active one (on open / interaction). */
  onActivate?: () => void;
}

export function ReviewRunAccordion({
  review,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
  active = true,
  onActivate,
}: ReviewRunAccordionProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bodyId = React.useId();
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      onActivate?.();
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRunId, targetNonce, review.run_id]);
  const toggle = () => {
    if (!open) onActivate?.();
    setOpen((o) => !o);
  };
  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = countBlockers(findings);
  const verdict = review.verdict;
  const agentName = review.agent_name ?? t("accordion.agentFallback");
  const confirmDelete = () => {
    if (window.confirm(t("accordion.confirmDelete", { agent: agentName }))) del.mutate(review.id);
  };

  return (
    <div ref={rootRef} id={review.run_id ? `review-run-${review.run_id}` : undefined} style={s.root}>
      <div style={s.headerRow}>
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={toggle} style={s.toggle}>
          <Icon.Cpu size={15} style={s.mutedIcon} />
          <span style={s.agent}>{agentName}</span>
          {verdict && (
            <Badge color={VERDICT_COLOR[verdict] ?? VERDICT_COLOR_FALLBACK} bg="transparent">
              {(KNOWN_VERDICTS as readonly string[]).includes(verdict)
                ? t(`accordion.verdict.${verdict as (typeof KNOWN_VERDICTS)[number]}`)
                : verdict}
            </Badge>
          )}
          <span style={s.counts}>
            {t("accordion.findings", { count: findings.length })}
            {blockers > 0 ? t("accordion.blockers", { count: blockers }) : ""}
          </span>
          <span style={s.spacer} />
          {review.score != null && (
            <Badge mono color="var(--text-secondary)">
              {review.score}
            </Badge>
          )}
          {/* Unknown cost (old review / no run) shows nothing — no header dashes. */}
          {review.cost_usd != null && <CostText usd={review.cost_usd} style={s.cost} />}
          <span className="mono" style={s.when}>
            {formatWhen(review.created_at)}
          </span>
          <Icon.ChevronDown size={16} style={s.chevron(open)} />
        </button>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={del.isPending}
          title={t("accordion.delete")}
          aria-label={t("accordion.delete")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spinning : undefined} />
        </button>
      </div>

      {open && (
        <div id={bodyId} style={s.body}>
          {verdict && (
            <div style={s.banner}>
              <VerdictBanner
                verdict={verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
                costUsd={review.cost_usd}
                tokensIn={review.tokens_in}
                tokensOut={review.tokens_out}
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoFullName={repoFullName}
            headSha={headSha}
            active={active}
            onActivate={onActivate}
          />
        </div>
      )}
    </div>
  );
}
