/* FindingsCell — the PR list's FINDINGS column: severity badges aggregated
   across every completed run for the PR, with a hover popover listing each
   finding read-only (no Accept/Reject — that's on the PR detail page only). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Popover, SeverityBadge } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { FindingsPopoverContent } from "./FindingsPopoverContent";

export function FindingsCell({ pr }: { pr: PrMeta }) {
  const t = useTranslations("prReview");
  const [hovered, setHovered] = React.useState(false);
  const counts = pr.findings;
  const total = counts ? counts.critical + counts.warning + counts.suggestion : 0;

  if (!counts || total === 0) {
    return <span style={{ color: "var(--text-muted)" }}>{t("list.findings.none")}</span>;
  }

  return (
    <Popover
      title={t("list.findings.popoverTitle", { count: total })}
      onOpenChange={setHovered}
      trigger={
        <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
          {counts.critical > 0 && <SeverityBadge severity="CRITICAL" count={counts.critical} compact />}
          {counts.warning > 0 && <SeverityBadge severity="WARNING" count={counts.warning} compact />}
          {counts.suggestion > 0 && <SeverityBadge severity="SUGGESTION" count={counts.suggestion} compact />}
        </div>
      }
    >
      <FindingsPopoverContent prId={pr.id!} open={hovered} />
    </Popover>
  );
}
