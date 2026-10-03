/* SkillCard — type chip, description, enabled toggle. Mirrors AgentCard's
   layout/interaction pattern (click-stopping wrapper around the Toggle so it
   doesn't bubble into the card's own onClick). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { skillTypeMeta } from "../../helpers";
import { s } from "./styles";

export function SkillCard({
  sk,
  onClick,
  onToggle,
}: {
  sk: Skill;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const meta = skillTypeMeta(sk.type);
  const imported = sk.source !== "manual";
  return (
    <div onClick={onClick} style={s.card(sk.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(meta.color)}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{sk.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={sk.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{sk.description}</div>
      <div style={s.metaRow}>
        <Badge color={meta.color} bg={meta.color + "1a"} icon={meta.icon}>
          {t(`listItem.type.${sk.type}`)}
        </Badge>
        {imported && (
          <Badge color="var(--text-secondary)" icon="Upload">
            {t(`listItem.source.${sk.source}`)}
          </Badge>
        )}
      </div>
    </div>
  );
}
