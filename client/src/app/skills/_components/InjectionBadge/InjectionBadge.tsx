/* InjectionBadge — small red "Injection detected" pill shared by the skill list row,
   the skill page header and the agent Skills tab. Standalone: no data fetching. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

export interface InjectionBadgeProps {
  /** Icon only (label kept as the accessible name + tooltip) for dense rows. */
  compact?: boolean;
  /** Override the visible/accessible text (e.g. from a caller's own i18n namespace). */
  label?: string;
  /** Tooltip; defaults to the "automatically blocked" explanation. */
  title?: string;
}

export function InjectionBadge({ compact = false, label, title }: InjectionBadgeProps) {
  const t = useTranslations("skills");
  const text = label ?? t("injection.badge");
  return (
    <span
      // Icon-only: expose the text as the accessible name; otherwise the visible label is the name.
      role={compact ? "img" : undefined}
      aria-label={compact ? text : undefined}
      title={title ?? t("injection.badgeTitle")}
    >
      <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertOctagon">
        {compact ? null : text}
      </Badge>
    </span>
  );
}
