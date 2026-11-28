/* TrustWarning — a skill's text becomes instructions in the agent's prompt;
   shown before an import is saved and above a community/imported skill's form. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function TrustWarning() {
  const t = useTranslations("skills");
  return (
    <div role="note" style={s.box}>
      <Icon.AlertTriangle size={15} style={s.icon} />
      <span>{t("import.trustWarning")}</span>
    </div>
  );
}
