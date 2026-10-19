/* CreateSkillBar — sticky footer shown once at least one candidate is
   accepted; opens the compose modal over every accepted convention. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function CreateSkillBar({ count, onCreate }: { count: number; onCreate: () => void }) {
  const t = useTranslations("conventions");
  return (
    <div style={s.bar} role="region" aria-label={t("bar.createSkill")}>
      <span style={s.count}>{t("bar.selected", { count })}</span>
      <Button kind="primary" icon="Sparkles" onClick={onCreate}>
        {t("bar.createSkill")}
      </Button>
    </div>
  );
}
