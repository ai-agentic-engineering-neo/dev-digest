"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SkillTypeTag } from "@devdigest/ui";
import { InjectionBadge } from "@/app/skills/_components/InjectionBadge";
import { SkillEnabledToggle } from "@/app/skills/_components/SkillEnabledToggle";
import { isLinkBlocked, type SkillRow } from "./helpers";
import { s } from "./styles";

export interface SkillRowContentProps {
  row: SkillRow;
  onToggle: (id: string) => void;
  /** Leading slot: the drag handle on Enabled rows, nothing on Available rows. */
  handle?: React.ReactNode;
}

/**
 * Inner layout shared by Enabled (sortable) and Available (static) rows: optional handle, link
 * toggle + name (one label, so the switch is named after the skill), the "disabled" note, the
 * injection badge and the type tag. An unlinked injection-flagged skill gets an inert toggle.
 */
export function SkillRowContent({ row, onToggle, handle }: SkillRowContentProps) {
  const t = useTranslations("agents");
  const { skill } = row;
  return (
    <>
      {handle}
      <label style={s.toggleLabel}>
        <SkillEnabledToggle on={row.linked} blocked={isLinkBlocked(row)} onChange={() => onToggle(skill.id)} />
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
      </label>
      {!skill.enabled && <span style={s.disabledNote}>{t("skills.disabledNote")}</span>}
      <span style={s.trailing}>
        {skill.injection_detected && <InjectionBadge />}
        <SkillTypeTag type={skill.type} />
      </span>
    </>
  );
}
