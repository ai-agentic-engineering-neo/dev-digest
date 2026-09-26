/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore, SEV } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsPopover } from "../FindingsPopover";
import { FINDINGS_FIELDS, SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  const totalFindings =
    (pr.findings_critical ?? 0) + (pr.findings_warning ?? 0) + (pr.findings_suggestion ?? 0);
  // Hover popover for the FINDINGS column («N FINDINGS IN THIS RUN»); read-only.
  // Anchored to the cell's viewport rect (fixed positioning) so the table
  // card's overflow: hidden never clips it.
  const [findingsAnchor, setFindingsAnchor] = React.useState<{ top: number; left: number } | null>(null);
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
        onMouseEnter={(e) => {
          if (totalFindings === 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          setFindingsAnchor({ top: r.bottom + 6, left: r.left });
        }}
        onMouseLeave={() => setFindingsAnchor(null)}
        data-testid="findings-cell"
      >
        {!reviewed || totalFindings === 0 ? (
          <span style={s.muted}>—</span>
        ) : (
          FINDINGS_FIELDS.map(({ sev, field }) => {
            const n = pr[field] ?? 0;
            if (!n) return null;
            const meta = SEV[sev];
            const SIcon = Icon[meta.icon];
            return (
              <span key={sev} className="tnum" style={s.findingChip(meta.c)} title={meta.label}>
                <SIcon size={13} />
                {n}
              </span>
            );
          })
        )}
        {findingsAnchor && totalFindings > 0 && (
          <FindingsPopover total={totalFindings} findings={pr.latest_findings ?? []} anchor={findingsAnchor} />
        )}
      </div>
      <div>
        <RunCostBadge
          variant="compact"
          costUsd={pr.cost_usd}
          title={pr.cost_runs ? t("list.costRuns", { count: pr.cost_runs }) : undefined}
        />
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
