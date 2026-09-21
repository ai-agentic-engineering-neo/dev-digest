/* AgentCard — name, description, enabled toggle, delete (with confirmation),
   model chip + skills count, and the "runs · accept · avg cost" stats line.
   Used by the /agents grid and as the left panel of /agents/:id. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle, ConfirmDialog } from "@devdigest/ui";
import type { AgentListItem } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { acceptColor, formatAcceptRate, formatAvgCost, modelColor } from "./helpers";
import { s } from "./styles";

/** Separator between the stats-line segments (real text, so copy/paste and text queries read naturally). */
const STATS_SEP = " · ";

export function AgentCard({
  ag,
  active,
  onClick,
  onToggle,
  onDeleted,
}: {
  ag: AgentListItem;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Called after this agent was deleted (e.g. to leave its own editor page). */
  onDeleted?: () => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const [confirming, setConfirming] = React.useState(false);
  const color = modelColor(ag.model);
  const noRuns = ag.runs === 0;
  // Nothing accepted yet reads as 0% (red), like the design — never a muted dash.
  const acceptRate = ag.accept_rate ?? 0;

  return (
    <>
      <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
        <div style={s.headerRow}>
          <div style={s.iconBox}>
            <Icon.Cpu size={15} />
          </div>
          <span style={s.name}>{ag.name}</span>
          {onToggle && (
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle on={ag.enabled} onChange={onToggle} size={14} />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            disabled={del.isPending}
            title={t("card.delete.action")}
            aria-label={t("card.delete.action")}
            style={s.trashBtn(del.isPending)}
          >
            <Icon.Trash size={14} style={del.isPending ? s.spin : undefined} />
          </button>
        </div>
        <div style={s.description}>{ag.description || t("card.noDescription")}</div>
        <div style={s.metaRow}>
          <span className="mono" style={s.modelChip(color)}>
            {ag.model}
          </span>
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: ag.skill_count })}
          </Badge>
        </div>
        <div style={s.statsRow} data-testid="agent-card-stats">
          <span>{t("card.runs", { count: ag.runs })}</span>
          {STATS_SEP}
          <span style={s.accept(acceptColor(acceptRate))}>{t("card.accept", { pct: formatAcceptRate(acceptRate) })}</span>
          {!noRuns && (
            <>
              {STATS_SEP}
              <span>{t("card.avgCost", { cost: formatAvgCost(ag.avg_cost_usd) })}</span>
            </>
          )}
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          danger
          loading={del.isPending}
          title={t("card.delete.title", { name: ag.name })}
          message={t("card.delete.message")}
          confirmLabel={t("card.delete.confirm")}
          cancelLabel={t("card.delete.cancel")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => del.mutate(ag.id, { onSuccess: () => onDeleted?.(), onSettled: () => setConfirming(false) })}
        />
      )}
    </>
  );
}
