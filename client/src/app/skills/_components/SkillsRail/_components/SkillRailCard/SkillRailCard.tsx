"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { needsVettingBadge, typeColor } from "./helpers";
import { s } from "./styles";

/** One row of the Skills rail: name, type/source badges, used-by count, and
 * the skill's own kill switch — a per-skill `enabled` toggle that patches
 * only that field (never the body-edit/version-bump path). */
export function SkillRailCard({
  skill,
  active,
  onClick,
  onDeleteRequest,
}: {
  skill: SkillSummary;
  active?: boolean;
  onClick?: () => void;
  onDeleteRequest?: (skill: SkillSummary) => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const vetting = needsVettingBadge(skill.source);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <Icon.Sparkles size={14} style={{ color: typeColor(skill.type), flexShrink: 0 }} />
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(v) => update.mutate({ id: skill.id, patch: { enabled: v } })}
            size={13}
          />
        </div>
        {onDeleteRequest && (
          <div onClick={(e) => e.stopPropagation()}>
            <IconBtn icon="Trash" label={t("delete.trigger", { name: skill.name })} onClick={() => onDeleteRequest(skill)} danger />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color={typeColor(skill.type)} mono>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        {skill.source !== "manual" && (
          <Badge icon="Upload" color="var(--text-secondary)">
            {t(`listItem.source.${skill.source}`)}
          </Badge>
        )}
        {vetting && !skill.enabled && (
          <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
            <span title={t("listItem.vettingTitle")}>{t("listItem.needsVetting")}</span>
          </Badge>
        )}
        <Badge icon="Users" color="var(--text-muted)">
          {t("card.usedBy", { count: skill.used_by })}
        </Badge>
      </div>
    </div>
  );
}
