"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import type { Conflict } from "@devdigest/shared";
import type { SelectedAgent } from "../../../../types";
import { ConflictCard } from "./_components/ConflictCard";
import { MIN_COUNTED_AGENTS } from "./constants";
import { s } from "./styles";

export interface ConflictsSectionProps {
  conflicts: Conflict[];
  agents: readonly SelectedAgent[];
  countedCount: number;
  onlyConflicts: boolean;
  onToggleOnlyConflicts: (on: boolean) => void;
}

export function ConflictsSection({
  conflicts,
  agents,
  countedCount,
  onlyConflicts,
  onToggleOnlyConflicts,
}: ConflictsSectionProps) {
  const t = useTranslations("runs");
  const canCompare = countedCount >= MIN_COUNTED_AGENTS;
  const titleId = React.useId();

  return (
    <section aria-labelledby={titleId} style={s.section}>
      <div style={s.header}>
        <h2 id={titleId} style={s.title}>
          {t("conflicts.title")}
        </h2>
        {canCompare && (
          <span style={s.toggleRow}>
            <Toggle on={onlyConflicts} onChange={onToggleOnlyConflicts} label={t("conflicts.onlyConflicts")} />
            <span aria-hidden>{t("conflicts.onlyConflicts")}</span>
          </span>
        )}
      </div>
      {!canCompare ? (
        <p style={s.muted}>{t("conflicts.needTwo")}</p>
      ) : conflicts.length === 0 ? (
        <p style={s.muted}>{t("conflicts.empty")}</p>
      ) : (
        <ul style={s.list}>
          {conflicts.map((c, i) => (
            <ConflictCard key={`${c.file}:${c.line}:${i}`} conflict={c} agents={agents} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default ConflictsSection;
