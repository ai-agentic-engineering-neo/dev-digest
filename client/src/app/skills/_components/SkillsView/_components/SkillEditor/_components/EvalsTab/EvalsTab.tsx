/* Evals tab — an honest placeholder. `eval_cases.ownerKind` already accepts
   'skill', so nothing here needs re-designing when L06 lands; wiring half of
   the eval surface now would be worse than saying it isn't built. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("skills");
  return (
    <EmptyState icon="FlaskConical" title={t("evals.emptyTitle")} body={t("evals.emptyBody")} />
  );
}
