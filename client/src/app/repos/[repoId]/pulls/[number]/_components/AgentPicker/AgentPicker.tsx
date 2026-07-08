/* AgentPicker — replaces the old single/all run dropdown (AC-1/2/3). A
   multi-select "Pick agents to run" panel listing every ENABLED agent with a
   checkbox + per-agent time estimate, a client-computed cost/time summary
   (AC-7), and a "Run multi-agent review (N)" action. Confirming kicks off
   POST /pulls/:id/multi-agent-run and routes to the run's live view. */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useTriggerMultiAgentRun } from "@/lib/hooks/multiAgentReview";
import { summariseEstimate } from "@/lib/utils/multiAgentEstimate";
import { formatCost, formatSeconds } from "./helpers";
import { s } from "./styles";

interface AgentPickerProps {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}

export function AgentPicker({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: AgentPickerProps) {
  const t = useTranslations("agentPicker");
  const router = useRouter();
  const { data: agents } = useAgents();
  const trigger = useTriggerMultiAgentRun();

  const enabledAgents = useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);

  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  // Default-check every enabled agent (OQ-4: no persistence — always reset to
  // "all checked" for agents not seen before, e.g. on first load).
  useEffect(() => {
    setChecked((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const a of enabledAgents) {
        if (!(a.id in next)) {
          next[a.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enabledAgents]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const checkedAgents = enabledAgents.filter((a) => checked[a.id]);
  const checkedCount = checkedAgents.length;
  const estimate = summariseEstimate(checkedAgents);
  const hasEstimate = estimate.total_time_ms > 0 || estimate.total_cost_usd > 0;

  const toggleAgent = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleRun = async () => {
    if (checkedCount === 0) return;
    setOpen(false);
    onRunStart?.();
    try {
      const res = await trigger.mutateAsync({
        prId,
        agentIds: checkedAgents.map((a) => a.id),
      });
      onRunsStarted?.(res.targets.map((target) => target.run_id));
      router.push(`/multi-agent-review/${prId}?multiRunId=${res.id}`);
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <div ref={ref} style={s.wrapper}>
      <span
        title={warnMerged ? t("mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={trigger.isPending}>
          {trigger.isPending ? t("running") : t("trigger")}
        </Button>
      </span>
      {open && (
        <div style={s.panel} role="dialog" aria-label={t("heading")}>
          <div style={s.heading}>{t("heading")}</div>

          {warnMerged && (
            <>
              <div style={s.mergedWarning}>
                <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <span>{t("mergedWarning")}</span>
              </div>
              <div style={s.divider} />
            </>
          )}

          {enabledAgents.length === 0 ? (
            <div style={s.empty}>{agents && agents.length > 0 ? t("noAgentsEnabled") : t("noAgents")}</div>
          ) : (
            enabledAgents.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <Checkbox
                  checked={!!checked[a.id]}
                  onChange={() => toggleAgent(a.id)}
                  label={<span style={s.agentName}>{a.name}</span>}
                />
                <span style={s.agentEstimate}>
                  {a.has_history && a.est_duration_ms != null ? formatSeconds(a.est_duration_ms) : t("noHistory")}
                </span>
              </div>
            ))
          )}

          <div style={s.divider} />

          <div style={s.summary}>
            {hasEstimate
              ? t("summary", {
                  time: formatSeconds(estimate.total_time_ms),
                  cost: formatCost(estimate.total_cost_usd),
                })
              : t("summaryNoEstimate")}
          </div>

          <div style={s.footer}>
            <button type="button" style={s.configureLink} onClick={() => router.push("/agents")}>
              <Icon.Settings size={13} />
              {t("configureAgents")}
            </button>
            <Button kind="primary" size="sm" disabled={checkedCount === 0} onClick={handleRun}>
              {t("runAction", { count: checkedCount })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
