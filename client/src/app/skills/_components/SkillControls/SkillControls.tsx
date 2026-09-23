/* SkillControls — the enabled switch (optimistic) and the trash button, shared
   by the grid SkillCard and the editor sidebar's SkillListItem. The wrapper
   stops clicks and keys so the row they sit in (a role="button" that opens the
   skill) does not fire. The host renders DeleteSkillModal as a sibling of the
   row: Modal has no portal, so inside a dimmed row it would inherit the opacity. */
"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { IconBtn, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useToggleSkill } from "@/lib/hooks";
import { s } from "./styles";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function SkillControls({
  skill,
  onDelete,
}: {
  skill: Pick<Skill, "id" | "name" | "enabled">;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  const toggle = useToggleSkill();

  return (
    <span onClick={stop} onKeyDown={stop} style={s.wrap}>
      {/* The label names the switch. */}
      <label style={s.wrap}>
        <span style={s.srOnly}>{t("card.enableLabel", { name: skill.name })}</span>
        <Toggle on={skill.enabled} onChange={(enabled) => toggle.mutate({ id: skill.id, enabled })} size={14} />
      </label>
      <IconBtn icon="Trash" danger size={26} label={t("card.deleteLabel", { name: skill.name })} onClick={onDelete} />
    </span>
  );
}
