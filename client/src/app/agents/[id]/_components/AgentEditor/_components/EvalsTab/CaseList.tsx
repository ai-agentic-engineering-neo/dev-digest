"use client";

import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import type { EvalCase, EvalCaseOutcome } from "@devdigest/shared/contracts/knowledge";
import { CaseRow } from "./CaseRow";
import { s } from "./styles";

/**
 * AC-37/AC-46 — the agent's eval cases. `outcomesByCaseId` is the latest
 * COMPLETED run's `per_case` array, keyed by case id (empty map when this
 * agent has never completed a run — every row then shows "—" instead of a
 * stale or fake result).
 */
export function CaseList({
  cases,
  isLoading,
  outcomesByCaseId,
  runDisabled,
  onOpen,
  onRun,
  onDelete,
}: {
  cases: EvalCase[] | undefined;
  isLoading: boolean;
  outcomesByCaseId: Map<string, EvalCaseOutcome>;
  runDisabled: boolean;
  onOpen: (caseId: string) => void;
  onRun: () => void;
  onDelete: (evalCase: EvalCase) => void;
}) {
  const t = useTranslations("eval");

  if (isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }

  if (!cases || cases.length === 0) {
    return <EmptyState icon="ListChecks" title={t("evalsTab.casesHeading")} body={t("empty.noCases")} />;
  }

  return (
    <div style={s.list}>
      {cases.map((c) => (
        <CaseRow
          key={c.id}
          evalCase={c}
          outcome={outcomesByCaseId.get(c.id) ?? null}
          runDisabled={runDisabled}
          onOpen={() => onOpen(c.id)}
          onRun={onRun}
          onDelete={() => onDelete(c)}
        />
      ))}
    </div>
  );
}
