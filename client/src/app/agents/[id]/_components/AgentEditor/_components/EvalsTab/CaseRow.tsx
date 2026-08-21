"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { EvalCase, EvalCaseOutcome } from "@devdigest/shared/contracts/knowledge";
import { s } from "./styles";

/**
 * AC-38 — name, expectation type, severity/category tags, expected vs actual
 * finding counts and pass/fail from the latest run, plus run/edit/delete.
 * `outcome` is this case's slice of the latest COMPLETED run's `per_case`
 * array (null when the case has never been covered by a completed run).
 * AC-55: pass/fail/errored carries an icon + text label, never colour alone.
 */
export function CaseRow({
  evalCase,
  outcome,
  runDisabled,
  onOpen,
  onRun,
  onDelete,
}: {
  evalCase: EvalCase;
  outcome: EvalCaseOutcome | null;
  runDisabled: boolean;
  onOpen: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const expectation = evalCase.expectation;

  return (
    <div style={s.row}>
      <div style={s.rowMain}>
        <div style={s.rowTitleLine}>
          <button type="button" style={s.rowName} onClick={onOpen}>
            {evalCase.name}
          </button>
          <Badge>
            {expectation.type === "must_find" ? t("expectation.mustFind") : t("expectation.mustNotFlag")}
          </Badge>
          {expectation.severity && <Badge color="var(--text-muted)">{expectation.severity}</Badge>}
          {expectation.category && <Badge color="var(--text-muted)">{expectation.category}</Badge>}
        </div>
        <div style={s.rowMetaLine}>
          <span>
            {outcome
              ? t("evalsTab.matchedCount", { matched: outcome.findings_matched, total: outcome.findings_total })
              : "—"}
          </span>
          <Outcome outcome={outcome} />
        </div>
      </div>
      <div style={s.rowActions}>
        <IconBtn icon="Play" label={t("evalsTab.run")} onClick={onRun} disabled={runDisabled} />
        <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={onOpen} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} onClick={onDelete} />
      </div>
    </div>
  );
}

function Outcome({ outcome }: { outcome: EvalCaseOutcome | null }) {
  const t = useTranslations("eval");
  if (!outcome) return null;
  if (outcome.status === "errored") {
    return (
      <span style={s.outcome("var(--warn)")}>
        <Icon.AlertTriangle size={12} />
        {t("evalsTab.errored")}
      </span>
    );
  }
  return outcome.pass ? (
    <span style={s.outcome("var(--ok, var(--text-secondary))")}>
      <Icon.CheckCircle size={12} />
      {t("evalsTab.passed")}
    </span>
  ) : (
    <span style={s.outcome("var(--crit)")}>
      <Icon.XCircle size={12} />
      {t("evalsTab.failed")}
    </span>
  );
}
