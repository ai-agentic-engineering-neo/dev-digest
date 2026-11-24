/* SkillCard — mono name, type badge, 2-line description, agent count, enabled
   toggle and delete. Same interaction pattern as AgentCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { buttonLikeProps } from "@/lib/a11y";
import { SKILL_TYPE_STYLE } from "@/lib/skill-type";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDeleted,
}: {
  skill: SkillListItem;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const style = SKILL_TYPE_STYLE[skill.type];
  return (
    <div {...buttonLikeProps(onClick)} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <Badge color={style.color} bg={style.bg}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} role="group" aria-label={t("card.toggle", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("card.deleteConfirm", { name: skill.name }))) {
              del.mutate(skill.id, { onSuccess: () => onDeleted?.() });
            }
          }}
          disabled={del.isPending}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)" icon="Cpu">
          {t("card.agentCount", { count: skill.agent_count })}
        </Badge>
      </div>
    </div>
  );
}
