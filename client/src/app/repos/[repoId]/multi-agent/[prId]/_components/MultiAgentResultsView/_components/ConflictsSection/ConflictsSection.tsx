/* ConflictsSection — where agents disagree, rendered beneath the results in
   BOTH layouts from the SAME computed `conflicts` array (AC-30). Three
   distinct states: conflicts present; zero conflicts with >=2 participants
   ("agents agree", AC-40); fewer than 2 participants ("needs two runs",
   AC-42) — never collapsed into one another. Conflicts are computed
   server-side on every read and never stored (D6, N13) — this component only
   renders what the API returned. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import type { Conflict } from "@devdigest/shared/contracts/observability";
import { s } from "./styles";

export function ConflictsSection({
  conflicts,
  participants,
  onlyConflicts,
  onToggleOnly,
}: {
  conflicts: Conflict[];
  /** Count of columns with status='done' — distinguishes AC-40 (>=2, zero
   *  conflicts) from AC-42 (<2, comparison isn't even meaningful yet). */
  participants: number;
  onlyConflicts: boolean;
  onToggleOnly: () => void;
}) {
  const t = useTranslations("runs");

  return (
    <section style={s.root} aria-label={t("conflicts.title")}>
      <div style={s.header}>
        <h2 style={s.title}>{t("conflicts.title")}</h2>
        <label style={s.toggle}>
          <input type="checkbox" checked={onlyConflicts} onChange={onToggleOnly} />
          {t("conflicts.onlyConflicts")}
        </label>
      </div>

      {participants < 2 ? (
        <div style={s.empty}>{t("conflicts.needTwoAgents")}</div>
      ) : conflicts.length === 0 ? (
        <div style={s.empty}>{t("conflicts.empty")}</div>
      ) : (
        <div style={s.list}>
          {conflicts.map((c, i) => (
            <div key={`${c.file}:${c.line}:${i}`} style={s.conflictRow}>
              <div style={s.conflictHead}>
                <span className="mono" style={s.conflictLocation}>
                  {c.file}:{c.line}
                </span>
                <span style={s.conflictTitle}>{c.title}</span>
              </div>
              <div style={s.takes}>
                {c.takes.map((take) => (
                  <div key={take.agent_id} style={s.take}>
                    <span>{take.persona}</span>
                    {take.verdict === "ignored" ? (
                      <span style={s.ignored}>{t("conflicts.didNotFlag")}</span>
                    ) : (
                      <SeverityBadge severity={take.verdict as Severity} compact />
                    )}
                    {take.note && <span style={s.note}>{take.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
