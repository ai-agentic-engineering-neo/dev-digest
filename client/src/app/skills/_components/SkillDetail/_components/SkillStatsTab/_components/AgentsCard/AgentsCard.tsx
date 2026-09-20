import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import { Badge, Icon } from "@devdigest/ui";
import { s } from "./styles";

export function AgentsCard({ agents }: { agents: SkillStats["agents"] }) {
  const t = useTranslations("skillStats");
  return (
    <section style={s.card} aria-labelledby="skill-stats-agents-title">
      <h3 id="skill-stats-agents-title" style={s.title}>
        <Icon.Settings size={14} />
        {t("agents.title")}
      </h3>
      {agents.length === 0 ? (
        <p style={s.muted}>{t("agents.none")}</p>
      ) : (
        <ul style={s.list}>
          {agents.map((a) => (
            <li key={a.id} style={s.row}>
              <span style={s.icon}><Icon.Cpu size={14} /></span>
              <span style={s.name}>{a.name}</span>
              {a.enabled ? null : <Badge mono>{t("agents.off")}</Badge>}
              <Link href={`/agents/${a.id}?tab=skills`} style={s.open} aria-label={t("agents.openAria", { name: a.name })}>
                {t("agents.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
