"use client";

import { useTranslations } from "next-intl";
import { Modal, Button, Skeleton, ErrorState } from "@devdigest/ui";
import { useEvalCompare } from "@/lib/hooks/eval";
import { formatMetricDeltaPct } from "@/lib/eval-format";
import { s } from "./styles";

/**
 * AC-32 … AC-34, AC-55 — metric deltas old→new, the case-set difference when
 * `only_in_old`/`only_in_new` are non-empty, and the `prompt_diff` lines
 * rendered as plain `<pre>` TEXT (AC-52 — no `dangerouslySetInnerHTML`) with
 * added/removed distinguished by BOTH a prefix glyph and colour (AC-55).
 */
export function CompareModal({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const t = useTranslations("eval");
  const { data: compare, isLoading, isError } = useEvalCompare(a, b);
  const na = t("notApplicable");

  return (
    <Modal title={t("compare.title")} onClose={onClose} width={720}>
      <div style={s.modalBody}>
        {isLoading && <Skeleton height={200} />}
        {isError && <ErrorState body={t("compare.selectTwo")} />}
        {compare && (
          <>
            <div style={s.tiles}>
              <DeltaTile label={t("dashboard.metrics.recall")} value={formatMetricDeltaPct(compare.deltas.recall, na)} />
              <DeltaTile
                label={t("dashboard.metrics.precision")}
                value={formatMetricDeltaPct(compare.deltas.precision, na)}
              />
              <DeltaTile
                label={t("dashboard.metrics.citationAccuracy")}
                value={formatMetricDeltaPct(compare.deltas.citation_accuracy, na)}
              />
            </div>

            {(compare.only_in_old.length > 0 || compare.only_in_new.length > 0) && (
              <p style={s.callout}>
                {t("compare.caseSetChanged", {
                  onlyOld: compare.only_in_old.length,
                  onlyNew: compare.only_in_new.length,
                  common: compare.common_case_ids.length,
                })}
              </p>
            )}

            <div style={s.section}>
              <h3 style={s.h2}>{t("compare.promptDiff")}</h3>
              {compare.prompt_diff.length === 0 ? (
                <p>{t("compare.noPromptDiff")}</p>
              ) : (
                <pre style={s.pre}>
                  {compare.prompt_diff.map((line, i) => (
                    <div key={i} style={s.diffLine(line.kind)}>
                      {(line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  ") + line.text}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </>
        )}

        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("compare.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeltaTile({ label, value }: { label: string; value: string }) {
  const up = value.startsWith("+");
  const down = value.startsWith("-");
  const color = up ? "var(--ok, var(--text-secondary))" : down ? "var(--crit)" : "var(--text-muted)";
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileDelta(color)}>{value}</div>
    </div>
  );
}
