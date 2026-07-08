/* ViewToggle — keyboard-operable Columns/Tabs segment control (AC-16).
   Switching modes is local state only; it never re-runs or re-fetches the
   underlying MultiAgentRun. Native <button> elements give Tab-focus +
   Enter/Space activation for free (WCAG 2.1 AA). */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export type ViewMode = "columns" | "tabs";

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const t = useTranslations("multiAgentReview");
  return (
    <div style={s.group} role="group" aria-label={t("viewToggle.label")}>
      <button
        type="button"
        aria-pressed={value === "columns"}
        style={s.segment(value === "columns")}
        onClick={() => onChange("columns")}
      >
        <Icon.PanelRight size={14} />
        {t("viewToggle.columns")}
      </button>
      <button
        type="button"
        aria-pressed={value === "tabs"}
        style={s.segment(value === "tabs")}
        onClick={() => onChange("tabs")}
      >
        <Icon.ListChecks size={14} />
        {t("viewToggle.tabs")}
      </button>
    </div>
  );
}
