"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { SKILL_TYPE, SKILL_SOURCE } from "./constants";
import { s } from "./styles";

export function SkillListItem({
  s: skill,
  active,
  onClick,
  onToggle,
}: {
  s: Skill;
  active: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const ty = SKILL_TYPE[skill.type];
  const src = SKILL_SOURCE[skill.source];
  const SrcIcon = Icon[src.icon];
  return (
    <div onClick={onClick} style={s.item(active, skill.enabled)}>
      <div style={s.headerRow}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle on={skill.enabled} onChange={onToggle} size={13} />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={13} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <span style={s.typeChip(ty.c)}>{t(`listItem.type.${ty.labelKey}`)}</span>
        <span style={s.source}>
          <SrcIcon size={11} />
          {t(`listItem.source.${src.labelKey}`)}
        </span>
        {!skill.enabled && skill.source !== "manual" && (
          <span style={s.vetting} title={t("listItem.vettingTitle")}>
            <Icon.Shield size={11} /> {t("listItem.needsVetting")}
          </span>
        )}
      </div>
    </div>
  );
}
