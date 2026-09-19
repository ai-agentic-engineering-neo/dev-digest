"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../lib/hooks/skills";
import { needsVettingBadge, typeColor } from "./helpers";
import { s } from "./styles";

/**
 * Grid card for the `/skills` list (mirrors `AgentCard`'s chrome so the two
 * list pages read as one system): icon, name, the skill's own kill switch,
 * delete request, description, and a type chip + used-by count.
 */
export function SkillCard({
  skill,
  onClick,
  onDeleteRequest,
}: {
  skill: SkillSummary;
  onClick?: () => void;
  onDeleteRequest?: (skill: SkillSummary) => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const color = typeColor(skill.type);
  const vetting = needsVettingBadge(skill.source);

  return (
    <div onClick={onClick} style={s.card(skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(v) => update.mutate({ id: skill.id, patch: { enabled: v } })}
            size={14}
          />
        </div>
        {onDeleteRequest && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(skill);
            }}
            title={t("delete.trigger", { name: skill.name })}
            aria-label={t("delete.trigger", { name: skill.name })}
            style={s.deleteBtn}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.typeChip(color)}>
          {t(`listItem.type.${skill.type}`)}
        </span>
        <Badge color="var(--text-secondary)" icon="Users">
          {t("card.usedBy", { count: skill.used_by })}
        </Badge>
        {vetting && !skill.enabled && (
          <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
            <span title={t("listItem.vettingTitle")}>{t("listItem.needsVetting")}</span>
          </Badge>
        )}
      </div>
    </div>
  );
}
