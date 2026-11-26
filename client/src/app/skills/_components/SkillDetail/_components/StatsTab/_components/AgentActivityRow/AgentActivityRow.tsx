/* AgentActivityRow — one attached agent with ITS OWN 30-day numbers (not the skill's). */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { SkillAgentActivity } from "@devdigest/shared";
import { ACCEPT_TONE_COLOR } from "../../constants";
import { acceptTone, agentSkillsHref, formatRate } from "../../helpers";
import { s } from "./styles";

export function AgentActivityRow({ agent }: { agent: SkillAgentActivity }) {
  const t = useTranslations("skills.stats");
  const toneColor = ACCEPT_TONE_COLOR[acceptTone(agent.accept_rate_30d)];
  return (
    <li style={s.row}>
      <span style={s.iconBox} aria-hidden>
        <Icon.Cpu size={14} />
      </span>
      <span style={s.name}>{agent.agent_name}</span>
      {!agent.enabled && <Badge color="var(--text-muted)">{t("disabled")}</Badge>}
      <span style={s.activity} className="tnum">
        {t("activity", { runs: agent.runs_30d, findings: agent.findings_30d })}
        {" · "}
        <span style={s.accept(toneColor)}>{t("accept", { rate: formatRate(agent.accept_rate_30d) })}</span>
      </span>
      <Link
        href={agentSkillsHref(agent.agent_id)}
        style={s.open}
        aria-label={t("openLabel", { name: agent.agent_name })}
      >
        {t("open")}
        <Icon.ArrowRight size={13} />
      </Link>
    </li>
  );
}
