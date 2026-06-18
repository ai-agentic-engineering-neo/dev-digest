/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { RunCostBadge } from "@/components/RunCostBadge";
import { FindingsCountChips, countBySeverity, totalCount } from "@/components/FindingsCountChips";
import { FindingsHoverCard } from "@/components/FindingsHoverCard";
import { FindingPreview } from "@/components/FindingPreview";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({
  pr,
  repoId,
  repoFullName,
}: {
  pr: PrMeta;
  repoId: string;
  /** owner/repo — lets the findings popover deep-link file:line to GitHub. */
  repoFullName?: string | null;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  const findings = pr.findings ?? [];
  const findingCounts = countBySeverity(findings);
  const findingTotal = totalCount(findingCounts);
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
      <div style={s.findingsCell}>
        {findingTotal === 0 ? (
          <span style={s.muted}>—</span>
        ) : (
          <FindingsHoverCard
            align="left"
            anchor={<FindingsCountChips counts={findingCounts} size={14} />}
            header={t("findingsPopover.header", { count: findingTotal })}
          >
            {findings.map((f) => (
              <FindingPreview
                key={f.id}
                f={f}
                repoFullName={repoFullName}
                headSha={pr.head_sha}
                prNumber={pr.number}
                onSelect={(id) =>
                  router.push(`/repos/${repoId}/pulls/${pr.number}?tab=findings&finding=${id}`)
                }
              />
            ))}
          </FindingsHoverCard>
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell}>
        <RunCostBadge variant="compact" cost={pr.cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
