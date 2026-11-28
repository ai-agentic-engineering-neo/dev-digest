/* Skill badges — the type pill (rubric/convention/security/custom) and the
   source tag (Manual / Imported / …) used on skill cards, the skill editor
   header and the agent editor's Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";
import { SKILL_SOURCE_ICONS, SKILL_TYPE_COLORS, THIRD_PARTY_SOURCES } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const c = SKILL_TYPE_COLORS[type];
  return (
    <Badge color={c.color} bg={c.bg} mono>
      {t(`type.${type}`)}
    </Badge>
  );
}

export function SkillSourceTag({ source }: { source: SkillSource }) {
  const t = useTranslations("skills");
  const I = Icon[SKILL_SOURCE_ICONS[source]];
  const thirdParty = THIRD_PARTY_SOURCES.includes(source);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        color: thirdParty ? "var(--warn)" : "var(--text-muted)",
      }}
    >
      <I size={12} />
      {t(`source.${source}`)}
    </span>
  );
}
