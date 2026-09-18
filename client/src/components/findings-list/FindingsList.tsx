/* FindingsList — compact, read-only findings rendered inside a Popover.
   Triage (accept/dismiss), keyboard nav and expandable markdown stay on the
   Findings tab's FindingsPanel; this is a glance surface. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SEV,
  CategoryTag,
  ConfidenceNum,
  MonoLink,
  Skeleton,
  type Severity,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { RATIONALE_CLAMP_LINES } from "./constants";
import { formatLocation, panelFindings } from "./helpers";

function FindingRow({ f }: { f: FindingRecord }) {
  const sev = SEV[f.severity as Severity] ?? SEV.INFO;
  const SevIcon = Icon[sev.icon];
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <SevIcon size={14} style={{ color: sev.c, flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 3,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {f.title}
          </span>
          <CategoryTag category={f.category} />
        </div>
        {/* wrap + minWidth:0 — a long path must push the confidence onto the
            next line, not out past the panel's right edge. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            minWidth: 0,
            marginBottom: 4,
          }}
        >
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <MonoLink>{formatLocation(f)}</MonoLink>
          </span>
          <ConfidenceNum value={f.confidence} />
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: RATIONALE_CLAMP_LINES,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {f.rationale}
        </div>
      </div>
    </div>
  );
}

export function FindingsList({
  findings,
  loading,
  scope,
}: {
  findings: FindingRecord[];
  loading?: boolean;
  /** Picks the heading wording; the COUNT always comes from the rendered list. */
  scope: "pr" | "run";
}) {
  const t = useTranslations("prReview");
  const shown = React.useMemo(() => panelFindings(findings), [findings]);
  // Derived here, never passed in: a caller-supplied count once drifted from
  // the list and the panel read "5 FINDINGS" above "No findings."
  const heading =
    scope === "run"
      ? t("findings.headingInRun", { count: shown.length })
      : t("findings.heading", { count: shown.length });

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          paddingBottom: 10,
          marginBottom: 10,
          borderBottom: "1px solid var(--border)",
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <Icon.AlertOctagon size={13} />
        {heading}
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : shown.length === 0 ? (
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{t("findings.none")}</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {shown.map((f) => (
            <FindingRow key={f.id} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}
