/* SkillTypeBadge — colored skill type label (rubric / convention / security /
   custom). Shared by the Skills page and the agent editor's Skills tab. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TYPE_COLOR } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  return <Badge color={TYPE_COLOR[type]}>{t(`listItem.type.${type}`)}</Badge>;
}
