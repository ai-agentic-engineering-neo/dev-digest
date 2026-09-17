/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import { SeverityCounts, SEVERITIES } from "@/components/severity-counts";
import { FindingsPreviewCard, anchorFrom } from "@/components/findings-preview";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks/reviews";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { latestFindingsPerAgent, relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  // Popover anchor in VIEWPORT coords (null = hidden). Fixed positioning keeps
  // the card visible even though the list container clips overflowing children.
  const [preview, setPreview] = React.useState<{ top: number; left: number } | null>(null);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  const counts = pr.findings_counts;
  const hasFindings = SEVERITIES.some((sev) => (counts?.[sev] ?? 0) > 0);
  // Lazy: the request only fires the first time the cell is hovered/focused,
  // then TanStack Query caches it. No new hook and no new endpoint.
  const { data: reviews } = usePrReviews(preview && hasFindings ? pr.id : null);
  const previewFindings = React.useMemo(() => latestFindingsPerAgent(reviews ?? []), [reviews]);

  const openPreview = (el: HTMLElement) => setPreview(anchorFrom(el.getBoundingClientRect(), window.innerWidth));
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
        style={s.findingsCell(hasFindings)}
        // Hover-only content is unreachable by keyboard, so focus opens it too.
        tabIndex={hasFindings ? 0 : undefined}
        aria-label={hasFindings ? t("list.findingsCellLabel") : undefined}
        onMouseEnter={(e) => openPreview(e.currentTarget)}
        onMouseLeave={() => setPreview(null)}
        onFocus={(e) => openPreview(e.currentTarget)}
        onBlur={() => setPreview(null)}
      >
        {hasFindings ? <SeverityCounts counts={counts} compact /> : <span style={s.muted}>—</span>}
        {preview && previewFindings.length > 0 && (
          <FindingsPreviewCard
            findings={previewFindings}
            title={t("list.findingsPreviewTitle", { count: previewFindings.length })}
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
      <div>
        <RunCostBadge costUsd={pr.cost_usd ?? null} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
