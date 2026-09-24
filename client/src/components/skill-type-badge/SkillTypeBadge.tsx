/* SkillTypeBadge — icon + label of a skill's type (rubric / convention /
   security / custom). Shared by the Skills screens and the Agent Editor. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_STYLE } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const { icon, color } = SKILL_TYPE_STYLE[type];
  return (
    <Badge color={color} bg={`${color}1a`} icon={icon}>
      {t(`type.${type}`)}
    </Badge>
  );
}
