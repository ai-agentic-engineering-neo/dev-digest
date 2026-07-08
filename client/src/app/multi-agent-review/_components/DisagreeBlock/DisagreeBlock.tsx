/* DisagreeBlock — the ONE "Where agents disagree" implementation shared by
   the Columns and Tabs views (AC-16, AC-20). Renders the server-computed
   Conflict[] groups (deterministic same-file + overlapping-range match,
   AC-21) — one row per agent showing its verdict or "did not flag" (AC-22)
   — with a client-side "Show only conflicts" toggle that hides unanimous
   groups without refetching (AC-23). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Icon, SeverityBadge, Toggle, type Severity } from "@devdigest/ui";
import type { Conflict } from "@devdigest/shared";
import { isConflictDivergent } from "./helpers";
import { s } from "./styles";

export function DisagreeBlock({ conflicts }: { conflicts: Conflict[] }) {
  const t = useTranslations("multiAgentReview");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);

  const shown = React.useMemo(
    () => (onlyConflicts ? conflicts.filter(isConflictDivergent) : conflicts),
    [conflicts, onlyConflicts],
  );

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <span style={s.title}>{t("disagree.title")}</span>
        <label style={s.toggleGroup}>
          {t("disagree.onlyConflicts")}
          <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={16} />
        </label>
      </div>

      {conflicts.length === 0 ? (
        <EmptyState icon="Users" title={t("disagree.emptyTitle")} body={t("disagree.emptyBody")} />
      ) : shown.length === 0 ? (
        <EmptyState icon="Filter" title={t("disagree.noneMatchTitle")} body={t("disagree.noneMatchBody")} />
      ) : (
        <div style={s.groups}>
          {shown.map((c, i) => (
            <div key={`${c.file}:${c.line}:${i}`} style={s.group}>
              <div style={s.groupHeader}>
                <span style={s.groupTitle}>{c.title}</span>
                <span className="mono" style={s.groupLocation}>
                  {c.file}:{c.line}
                </span>
              </div>
              {c.takes.map((take, j) => (
                <div
                  key={take.agent_id}
                  style={j === c.takes.length - 1 ? s.takeRowLast : s.takeRow}
                >
                  <span style={s.persona}>{take.persona}</span>
                  {take.verdict === "ignored" ? (
                    <span style={s.didNotFlag}>
                      <Icon.Slash size={12} />
                      {t("disagree.didNotFlag")}
                    </span>
                  ) : (
                    <SeverityBadge severity={take.verdict as Severity} compact />
                  )}
                  {take.note && <span style={s.note}>{take.note}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
