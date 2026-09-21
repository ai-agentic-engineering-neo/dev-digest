/* PlaceholderTab — shared not-yet-built mount for the Evals/Stats tabs.
   Skill-level evals/stats (run attribution, charts, new schema) are
   explicitly out of scope for this iteration. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

export function PlaceholderTab({ icon, label }: { icon: IconName; label: string }) {
  const t = useTranslations("skills");
  const I = Icon[icon];
  return (
    <div style={s.wrap}>
      <div style={s.iconBox}>
        <I size={22} />
      </div>
      <div style={s.body}>{t("placeholder.body", { label })}</div>
    </div>
  );
}
