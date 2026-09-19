"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { s } from "./styles";

/** Placeholder (D4) — Evals ships in L06 (`docs/architecture.md`); the
 * "Run on evals" action itself lives in `SkillEditor`'s header, not here. */
export function EvalsTab() {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <EmptyState icon="FlaskConical" title={t("evals.placeholderTitle")} body={t("evals.placeholderBody")} />
    </div>
  );
}
