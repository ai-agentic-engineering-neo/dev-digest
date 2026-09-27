/* StatsTab — what this skill costs and who loads it.
   Every number here is DERIVED: the agent links, the stored version, and the
   prompt-size estimate. Pull frequency / accept rate / findings-per-skill from
   the design are absent on purpose — nothing records which skill produced a
   finding, so those figures would be invented. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents } from "@/lib/hooks/skills";
import { approxTokens } from "@/lib/tokens";
import { s } from "./styles";

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card style={s.metric}>
      <div style={s.metricLabel}>{label}</div>
      <div style={s.metricValue}>
        {value}
        {unit && <span style={s.metricUnit}>{unit}</span>}
      </div>
    </Card>
  );
}

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: agents, isLoading } = useSkillAgents(skill.id);
  const usedBy = agents?.length ?? skill.agent_count;

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("stats.title")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 18px" }}>
        {t("stats.subtitle")}
      </p>

      <div style={s.metrics}>
        <Metric
          label={t("stats.usedBy")}
          value={String(usedBy)}
          unit={t("stats.agentsUnit", { count: usedBy })}
        />
        <Metric label={t("stats.version")} value={`v${skill.version}`} />
        <Metric
          label={t("stats.promptSize")}
          value={String(approxTokens(skill.body))}
          unit={t("stats.tokensUnit")}
        />
      </div>

      <div style={{ marginTop: 26 }}>
        <SectionLabel>{t("stats.agentsUsing")}</SectionLabel>
        {isLoading && <Skeleton height={48} />}
        {!isLoading && (agents?.length ?? 0) === 0 && (
          <p style={s.emptyNote}>{t("stats.none")}</p>
        )}
        {(agents ?? []).map((a) => (
          <Card key={a.id} style={s.agentRow}>
            <Icon.Cpu size={14} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
            <Badge color="var(--text-muted)">{t("stats.position", { order: a.order + 1 })}</Badge>
            {!a.enabled && (
              <Badge color="var(--text-muted)">{t("stats.disabledAgent")}</Badge>
            )}
            <span style={{ marginLeft: "auto" }}>
              <Button
                kind="ghost"
                size="sm"
                onClick={() => router.push(`/agents/${a.id}?tab=skills`)}
              >
                {t("stats.open")}
              </Button>
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
