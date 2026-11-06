/* AgentPickCard — one selectable agent in the run config. Native checkbox: the kit Checkbox has no `disabled`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { AgentBadge } from "@/components/agent-badge";
import { formatCost } from "@/components/run-cost-badge";
import type { AgentRunEstimate } from "@/lib/types";
import { formatSeconds } from "../../../../helpers";
import { MAX_AGENTS_PER_RUN } from "../../../../constants";
import { s } from "./styles";

export interface AgentPickCardProps {
  agent: Agent;
  colorIndex: number;
  checked: boolean;
  disabled: boolean;
  estimate: AgentRunEstimate | undefined;
  onToggle: (checked: boolean) => void;
}

export function AgentPickCard({ agent, colorIndex, checked, disabled, estimate, onToggle }: AgentPickCardProps) {
  const t = useTranslations("runs");
  return (
    <label style={s.card(checked, disabled, colorIndex)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={agent.name}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <AgentBadge colorIndex={colorIndex} size={28} />
      <span style={s.body}>
        <span style={s.head}>
          <span style={s.name}>{agent.name}</span>
          {!agent.enabled && <span style={s.hint}>{t("config.disabled")}</span>}
        </span>
        <span style={s.model}>{agent.model}</span>
        <span style={s.description}>{agent.description}</span>
        {estimate && (
          <span style={s.hint}>
            {t("config.estimate", {
              seconds: formatSeconds(estimate.avg_duration_ms),
              cost: formatCost(estimate.avg_cost_usd),
            })}
          </span>
        )}
        {disabled && !checked && <span style={s.hint}>{t("config.capHint", { max: MAX_AGENTS_PER_RUN })}</span>}
      </span>
    </label>
  );
}

export default AgentPickCard;
