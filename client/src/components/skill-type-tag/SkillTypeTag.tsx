"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "./constants";

/** The coloured `rubric` / `security` / … tag shown on skill cards and rows. */
export function SkillTypeTag({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const { c, bg } = SKILL_TYPE_COLOR[type];
  return (
    <Badge color={c} bg={bg} mono>
      {t(`card.type.${type}`)}
    </Badge>
  );
}
