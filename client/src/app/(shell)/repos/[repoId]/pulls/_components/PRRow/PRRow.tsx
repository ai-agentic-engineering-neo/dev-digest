/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore, SeverityBadge } from "@devdigest/ui";
import type { PrMeta } from "@devdigest/shared";
import { formatCost } from "@/lib/format";
import { usePrReviews } from "@/lib/api/reviews";
import { FindingsPreviewCard } from "./FindingsPreviewCard";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { latestFindingsPerAgent, presentFindingsSeverities } from "../../helpers";
import { relativeTime } from "@/lib/date";
import { sizeOf } from "../../_lib/model";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  // Popover anchor in viewport coords (null = hidden). position: fixed keeps
  // it visible even though the list container clips overflowing children.
  const [preview, setPreview] = React.useState<{ top: number; left: number } | null>(null);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  const severities = presentFindingsSeverities(pr);
  const hasFindings = severities.length > 0;
  // Hover preview is fetched lazily — the query only fires the first time the
  // findings cell is hovered, then TanStack Query caches it (same ["reviews",
  // prId] key the PR detail page uses).
  const { data: reviews } = usePrReviews(pr.id, preview != null && hasFindings);
  const previewFindings = React.useMemo(() => latestFindingsPerAgent(reviews ?? []), [reviews]);

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
        data-testid="findings-cell"
        style={s.findingsCell}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPreview({
            top: rect.bottom + 6,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 408)),
          });
        }}
        onMouseLeave={() => setPreview(null)}
      >
        {hasFindings ? (
          severities.map(([sev, count]) => <SeverityBadge key={sev} severity={sev} count={count} compact />)
        ) : (
          <span style={s.muted}>—</span>
        )}
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
      <div data-testid="cost-cell" className="mono" style={pr.cost_usd != null ? s.costCell : { ...s.costCell, ...s.muted }}>
        {formatCost(pr.cost_usd)}
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
