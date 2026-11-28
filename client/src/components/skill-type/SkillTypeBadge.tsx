/* SkillTypeBadge — the type chip of a skill, coloured by type. Shared by the
   Skills Lab and the agent editor's Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_TONE } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("common");
  const tone = SKILL_TYPE_TONE[type];
  return (
    <Badge color={tone.c} bg={tone.bg}>
      {t(`skillType.${type}`)}
    </Badge>
  );
}
