"use client";

import { useTranslations } from "next-intl";
import { Modal, Button, Icon } from "@devdigest/ui";
import type { EvalAgentSummary, EvalRunAllResult } from "@devdigest/shared/contracts/eval-ci";
import { useRunAllEvals } from "@/lib/hooks/eval";
import { s } from "./styles";

/**
 * AC-25/AC-42 — states the total execution count BEFORE anything runs, and
 * `confirm: true` only goes out once the user clicks "Run all" here (the
 * server 422s the route without it — this dialog IS the confirmation, not a
 * client-side nicety). Reports per-agent progress/failure, never one
 * combined verdict.
 */
export function RunAllModal({ agents, onClose }: { agents: EvalAgentSummary[]; onClose: () => void }) {
  const t = useTranslations("eval");
  const runAll = useRunAllEvals();

  const relevant = agents.filter((a) => a.cases_total > 0);
  const executionsTotal = relevant.reduce((sum, a) => sum + a.cases_total, 0);

  const result: EvalRunAllResult | undefined = runAll.data;

  return (
    <Modal title={t("run.confirmAll.title")} onClose={onClose} width={520}>
      <div style={s.modalBody}>
        {!result ? (
          <p>{t("run.confirmAll.body", { agents: relevant.length, executions: executionsTotal })}</p>
        ) : (
          <div style={s.section}>
            {result.started.map((row) => (
              <div key={row.agent_id} style={s.resultRow}>
                {row.run_id ? (
                  <span style={s.outcome("var(--ok, var(--text-secondary))")}>
                    <Icon.CheckCircle size={13} />
                    {row.agent_name} — {t("dashboard.started")}
                  </span>
                ) : (
                  <span style={s.outcome("var(--crit)")}>
                    <Icon.XCircle size={13} />
                    {row.agent_name} — {row.refused_reason ?? t("dashboard.refused")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("run.confirmAll.cancel")}
          </Button>
          {!result && (
            <Button kind="primary" loading={runAll.isPending} onClick={() => runAll.mutate()}>
              {t("run.confirmAll.confirm")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
