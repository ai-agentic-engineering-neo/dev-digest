/* DocSourceBadge — coloured chip for a project-context doc's source (specs / docs / insights /
   readme / devdigest). Colour from DOC_SOURCE_COLORS, text from the caller (translated), so a
   badge is never colour-only and renders on /showcase without a NextIntlClientProvider. */
import React from "react";
import { Badge } from "@devdigest/ui";
import { DOC_SOURCE_COLORS, type DocSourceKey } from "@/lib/context-docs";

export interface DocSourceBadgeProps {
  source: DocSourceKey;
  label: string;
}

export function DocSourceBadge({ source, label }: DocSourceBadgeProps) {
  const c = DOC_SOURCE_COLORS[source];
  return (
    <Badge color={c.color} bg={c.bg} mono>
      {label}
    </Badge>
  );
}
