/* ModifiedLocallyBadge — marks a project document whose text is a local
   override (edited in DevDigest, never pushed to the repository). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

export function ModifiedLocallyBadge({ updatedAt }: { updatedAt?: string | null }) {
  const t = useTranslations("context");
  const when = updatedAt ? new Date(updatedAt) : null;
  const title = when && !Number.isNaN(when.getTime()) ? t("badge.modifiedTitle", { when: when.toLocaleString() }) : undefined;
  return (
    <span title={title} data-testid="modified-locally-badge">
      <Badge color="var(--accent)" bg="var(--bg-hover)">
        {t("badge.modified")}
      </Badge>
    </span>
  );
}
