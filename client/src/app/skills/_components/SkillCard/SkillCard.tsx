/* SkillCard — one skill in the grid: type icon · name · enabled toggle · delete ·
   description · type badge · source · footer `{n} agents · v{version}`.
   Delete only asks the parent to open the confirm dialog (DeleteSkillDialog). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge, SkillTypeIcon } from "../SkillTypeBadge";
import { SOURCE_ICON } from "./constants";
import { s } from "./styles";

export interface SkillCardProps {
  skill: Skill;
  href: string;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function SkillCard({ skill, href, onSelect, onToggle, onDelete }: SkillCardProps) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  return (
    <article onClick={onSelect} style={s.card(skill.enabled)}>
      <div style={s.headerRow}>
        <SkillTypeIcon type={skill.type} />
        <Link href={href} onClick={stop} className="mono" style={s.name}>
          {skill.name}
        </Link>
        <label onClick={stop}>
          <span style={s.visuallyHidden}>{t("preview.enabled")}</span>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </label>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onDelete();
          }}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={s.deleteBtn}
        >
          <Icon.Trash size={14} />
        </button>
      </div>
      <div style={s.description} title={skill.description}>
        {skill.description}
      </div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={12} />
          {t(`listItem.source.${skill.source}`)}
        </span>
      </div>
      <div style={s.divider} />
      <div className="tnum" style={s.footer}>
        {t("card.footer", { count: skill.agent_count, version: skill.version })}
      </div>
    </article>
  );
}
