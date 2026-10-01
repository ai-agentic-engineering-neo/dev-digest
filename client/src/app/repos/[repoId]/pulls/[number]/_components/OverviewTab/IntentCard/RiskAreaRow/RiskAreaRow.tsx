"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { IntentRiskArea } from "@devdigest/shared";
import { RISK_ICON } from "../constants";
import { fileLine } from "./helpers";
import { s } from "./styles";

/** One risk area: a disclosure row (title + file:line) that expands to its explanation. */
export function RiskAreaRow({ risk }: { risk: IntentRiskArea }) {
  const t = useTranslations("brief.intentCard");
  const [open, setOpen] = React.useState(false);
  const Kind = Icon[RISK_ICON[risk.kind]];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  const bodyId = React.useId();
  const hot = risk.kind === "security";
  const where = fileLine(risk.file, risk.line);

  return (
    <div style={s.row(hot)}>
      <button
        type="button"
        style={s.button}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${risk.title} — ${open ? t("hideDetails") : t("showDetails")}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Kind size={14} style={hot ? s.iconHot : s.icon} aria-hidden />
        <span style={s.title} title={risk.title}>
          {risk.title}
        </span>
        <span className="mono" style={s.where} title={where}>
          {where}
        </span>
        <Chevron size={14} style={s.chevron} aria-hidden />
      </button>
      {open && (
        <div id={bodyId} style={s.body}>
          {risk.explanation}
        </div>
      )}
    </div>
  );
}
