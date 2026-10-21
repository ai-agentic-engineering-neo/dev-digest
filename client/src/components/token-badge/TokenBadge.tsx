"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

/** "≈ N tokens": counts are tokenizer approximations (cl100k_base), so the label says so. */
export function TokenBadge({ count }: { count: number }) {
  const t = useTranslations("context");
  return (
    <Badge color="var(--text-muted)" mono>
      {t("row.tokens", { count })}
    </Badge>
  );
}
