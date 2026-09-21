"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import { FindingPreviewPanel } from "@/components/finding-preview";
import type { PrFindings, Severity } from "@devdigest/shared";

const ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function FindingsCell({ findings }: { findings?: PrFindings | null }) {
  const t = useTranslations("prReview");
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  if (!findings || findings.total === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const present = ORDER.filter((l) => (findings.counts[l] ?? 0) > 0);
  const open = hovered || focused;

  return (
    <div
      data-testid="findings-cell"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        setHovered(false);
        setFocused(false);
      }}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "relative", display: "inline-flex", gap: 6, cursor: "default" }}
    >
      {present.map((l) => (
        <SeverityBadge key={l} severity={l} count={findings.counts[l]} compact />
      ))}

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30 }}>
          <FindingPreviewPanel
            heading={t("list.findingsInRun", { count: findings.total })}
            items={findings.previews}
          />
        </div>
      )}
    </div>
  );
}
