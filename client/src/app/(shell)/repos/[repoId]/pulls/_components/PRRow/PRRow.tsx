/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore, SeverityBadge, type Severity } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks/reviews";
import {
  FindingsPreviewCard,
  anchorFor,
  latestReviewPerAgent,
  PREVIEW_SEVERITIES,
} from "@/components/findings-preview";
import { PREVIEW_HOVER_DELAY_MS, SIZE_COLOR, STATUS_META } from "../../constants";
import { formatUsd } from "@/lib/format";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed

  // FINDINGS: per-severity counts over each agent's latest review, straight off
  // the list payload.
  const counts = pr.findings_by_severity;
  const total = counts ? counts.CRITICAL + counts.WARNING + counts.SUGGESTION : 0;

  // The preview opens only after the pointer rests on the cell, and the query
  // stays armed afterwards so a second hover is served from the cache.
  const [preview, setPreview] = React.useState<{ top: number; left: number } | null>(null);
  const [armed, setArmed] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const { data: reviews, isLoading } = usePrReviews(armed && total > 0 ? pr.id : null);

  const openPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    if (total === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    timer.current = setTimeout(() => {
      setArmed(true);
      setPreview(anchorFor(rect, { width: window.innerWidth, height: window.innerHeight }));
    }, PREVIEW_HOVER_DELAY_MS);
  };
  const closePreview = () => {
    if (timer.current) clearTimeout(timer.current);
    setPreview(null);
  };

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div
        style={s.findingsCell}
        role="group"
        aria-label={t("list.findingsBySeverity")}
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
      >
        {total === 0 ? (
          <span style={s.muted} title={counts ? t("list.noFindings") : undefined}>
            —
          </span>
        ) : (
          PREVIEW_SEVERITIES.filter((sev) => counts![sev] > 0).map((sev) => (
            // `compact` drops the text label, so the count alone would leave
            // colour as the only signal — the title carries it for everyone else.
            <span key={sev} title={t("list.severityCount", { severity: sev, count: counts![sev] })}>
              <SeverityBadge severity={sev as Severity} count={counts![sev]} compact />
            </span>
          ))
        )}
        {preview && total > 0 && (
          <FindingsPreviewCard
            findings={latestReviewPerAgent(reviews ?? []).flatMap((r) => r.findings)}
            total={total}
            title={t("list.findingsPreviewTitle", { count: total })}
            loading={isLoading}
            top={preview.top}
            left={preview.left}
          />
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div className="tnum" style={s.costCell}>
        {formatUsd(pr.cost_usd)}
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
