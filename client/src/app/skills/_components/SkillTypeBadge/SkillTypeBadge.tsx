"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_STYLE } from "./constants";

/** Type-coloured label (`rubric`, `security`, …). The type has no effect on behaviour. */
export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const style = SKILL_TYPE_STYLE[type];
  return (
    <Badge color={style.color} bg={style.bg}>
      {t(`listItem.type.${type}`)}
    </Badge>
  );
}
