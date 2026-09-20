"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, Icon, Toggle } from "@devdigest/ui";
import type { Skill, SkillStatsSummary } from "@devdigest/shared";
import { SKILL_SOURCE_ICON, SKILL_TYPE_COLOR, formatRate, tintOf } from "@/lib/skills";
import { s } from "./styles";

interface Props {
  skill: Skill;
  /** undefined = still loading (footer hidden); null = no stats row for this skill. */
  stats?: SkillStatsSummary | null;
  active?: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}

export function SkillCard({ skill, stats, active, onOpen, onToggle }: Props) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];
  const SourceIcon = Icon[SKILL_SOURCE_ICON[skill.source]];
  return (
    <Card pad={false} style={{ ...s.card, ...(active ? s.active : null) }}>
      <button type="button" style={s.open} onClick={onOpen} aria-current={active ? "true" : undefined}>
        <span style={s.top}>
          <span style={s.tile(color, tintOf(color))}>
            <Icon.Sparkles size={13} />
          </span>
          <span className="mono" style={s.name} title={skill.name}>
            {skill.name}
          </span>
        </span>
        <span style={s.desc}>{skill.description}</span>
        <span style={s.meta}>
          <Badge color={color} bg={tintOf(color)}>
            {t(`listItem.type.${skill.type}`)}
          </Badge>
          <span style={s.source}>
            <SourceIcon size={12} />
            {t(`listItem.source.${skill.source}`)}
          </span>
        </span>
        {stats !== undefined && (
          <span style={s.footer}>
            <span>{t("card.agents", { count: stats?.agents_count ?? 0 })}</span>
            <span>{t("card.pull", { value: formatRate(stats?.pull_rate) })}</span>
            <span style={stats?.accept_rate == null ? undefined : s.accept}>
              {t("card.accept", { value: formatRate(stats?.accept_rate) })}
            </span>
          </span>
        )}
      </button>
      <span style={s.toggle} role="group" aria-label={t("card.enabledLabel", { name: skill.name })}>
        <Toggle on={skill.enabled} onChange={onToggle} />
      </span>
    </Card>
  );
}
