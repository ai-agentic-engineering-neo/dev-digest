/* Full-width red banner shown above the editor tabs for an injection-flagged skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function InjectionBanner() {
  const t = useTranslations("skills");
  return (
    <div role="alert" style={s.banner}>
      <Icon.AlertOctagon size={18} style={s.icon} />
      <div>
        <div style={s.title}>{t("injection.banner.title")}</div>
        <div style={s.body}>{t("injection.banner.body")}</div>
      </div>
    </div>
  );
}
