/* SpecsRead — the Configuration "Specs read" value (SPEC-04 AC-6): included docs, then left-out
   docs (muted) with a reason chip, a "changed by this PR" marker on docs the PR edits, the
   "unavailable" note, or the bare path list of runs recorded before this detail existed. Doc paths
   are untrusted: plain text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { LeftOutReason } from "@/lib/types";
import type { SpecsReadView } from "../../helpers";
import { s } from "./styles";

const REASON_COLOR: Record<LeftOutReason, { color: string; bg: string }> = {
  too_large: { color: "var(--warn)", bg: "var(--warn-bg)" },
  over_cap: { color: "var(--warn)", bg: "var(--warn-bg)" },
  missing: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

export function SpecsRead({ view }: { view: SpecsReadView }) {
  const t = useTranslations("runs");

  const changedMarker = (path: string) => {
    const hint = t("trace.projectContext.prChanges", { path });
    return (
      <span title={hint} aria-label={hint} style={s.changed}>
        {t("trace.specsRead.changedByPr")}
      </span>
    );
  };

  if (view.kind === "none") {
    return (
      <div style={s.wrap}>
        <span style={s.none}>{t("trace.config.none")}</span>
      </div>
    );
  }

  if (view.kind === "paths") {
    return (
      <div style={s.wrap}>
        {view.paths.map((p, i) => (
          <span key={i} className="mono" style={s.path}>
            {p}
          </span>
        ))}
      </div>
    );
  }

  if (view.kind === "unavailable") {
    return (
      <div style={s.wrap}>
        <span style={s.unavailable}>{t("trace.projectContext.unavailable")}</span>
        {view.attached.map((p, i) => (
          <span key={i} className="mono" style={s.path}>
            {p}
          </span>
        ))}
      </div>
    );
  }

  if (view.included.length === 0 && view.leftOut.length === 0) {
    return (
      <div style={s.wrap}>
        <span style={s.none}>{t("trace.config.none")}</span>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      {view.included.map((d, i) => (
        <span key={`in-${i}`} style={s.item}>
          <span className="mono" style={s.path}>
            {d.path}
          </span>
          {d.changed && changedMarker(d.path)}
        </span>
      ))}
      {view.leftOut.map((d, i) => (
        <span key={`out-${i}`} style={s.item}>
          <span className="mono" style={s.leftOutPath}>
            {d.path}
          </span>
          <Badge color={REASON_COLOR[d.reason].color} bg={REASON_COLOR[d.reason].bg}>
            {t(`trace.projectContext.reason.${d.reason}`)}
          </Badge>
          {d.changed && changedMarker(d.path)}
        </span>
      ))}
    </div>
  );
}
