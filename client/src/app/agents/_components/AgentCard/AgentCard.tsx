/* AgentCard — name + enabled toggle, description, model chip + skill count,
   and a stats footer (runs · accept rate · avg cost). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { acceptColor, modelColor, shortModel } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const color = modelColor(ag.model);
  const stats = ag.stats;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      style={s.card(!!active, ag.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <label onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <span style={s.srOnly}>{t("card.enabledLabel", { name: ag.name })}</span>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </label>
        )}
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)} title={ag.model}>
          {shortModel(ag.model)}
        </span>
        {skillCount != null && (
          <span style={s.skillChip}>
            <Icon.Sparkles size={11} />
            {t("card.skillCount", { count: skillCount })}
          </span>
        )}
      </div>
      {stats && (
        <div className="mono" style={s.footer}>
          <span>{t("card.runs", { count: stats.runs })}</span>
          {stats.accept_rate != null && (
            <span style={{ color: acceptColor(stats.accept_rate) }}>
              {t("card.accept", { pct: Math.round(stats.accept_rate * 100) })}
            </span>
          )}
          {stats.avg_cost_usd != null && <span>{t("card.avgCost", { cost: formatCost(stats.avg_cost_usd) })}</span>}
        </div>
      )}
    </div>
  );
}
