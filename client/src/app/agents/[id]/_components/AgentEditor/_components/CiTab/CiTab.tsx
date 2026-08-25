"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, SectionLabel, EmptyState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import type { CiFailOn } from "@devdigest/shared/contracts/knowledge";
import { useCiInstallations, useRepublishCi } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { ExportWizard } from "./_components/ExportWizard";
import { s } from "./styles";

/** D10 — the three-way gate control maps to three of `CiFailOn`'s four
 *  values; `any` stays settable on the Config tab only. */
const GATE_OPTIONS: { value: CiFailOn; labelKey: string }[] = [
  { value: "critical", labelKey: "ciTab.gate.critical" },
  { value: "warning", labelKey: "ciTab.gate.warning" },
  { value: "never", labelKey: "ciTab.gate.never" },
];

/**
 * specs/14-export-to-ci.md AC-33…AC-39 — the agent editor's CI tab: how many
 * repositories the agent is deployed to, the three-way gate control, the
 * installation list (repo, CI system, most recent run status/time), "Update
 * CI config" per installation, and the export wizard entry point.
 */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const toast = useToast();
  const { data: installations, isLoading } = useCiInstallations(agent.id);
  const updateAgent = useUpdateAgent();
  const republish = useRepublishCi(agent.id);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const setGate = (value: CiFailOn) => {
    updateAgent.mutate(
      { id: agent.id, patch: { ci_fail_on: value } },
      { onError: () => toast.error(t("ciTab.gateError")) }
    );
  };

  const handleUpdate = (installationId: string) => {
    republish.mutate(installationId, {
      onSuccess: (result) => {
        if (result.refused_reason) toast.error(result.refused_reason);
        else toast.success(t("ciTab.updateSuccess"));
      },
      onError: () => toast.error(t("ciTab.updateError")),
    });
  };

  const count = installations?.length ?? 0;

  return (
    <div style={s.wrap}>
      {wizardOpen && (
        <ExportWizard agent={agent} onClose={() => setWizardOpen(false)} />
      )}

      <div>
        <div style={s.header}>
          <h2 style={s.h2}>{t("ciTab.heading")}</h2>
          <div style={s.headSpacer}>
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setWizardOpen(true)}>
              {count > 0 ? t("ciTab.addRepo") : t("ciTab.exportToCi")}
            </Button>
          </div>
        </div>
        <p style={s.hint}>{t("ciTab.subtitle")}</p>
        <p style={s.hint}>{t("ciTab.deployedCount", { count })}</p>
      </div>

      <div style={s.section}>
        <SectionLabel icon="Cpu">{t("ciTab.gateHeading")}</SectionLabel>
        <p style={s.hint}>{t("ciTab.gateExplain")}</p>
        <div style={s.gateRow} role="radiogroup" aria-label={t("ciTab.gateHeading")}>
          {GATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={agent.ci_fail_on === opt.value}
              style={s.gateOption(agent.ci_fail_on === opt.value)}
              onClick={() => setGate(opt.value)}
              disabled={updateAgent.isPending}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <SectionLabel icon="GitBranch">{t("ciTab.installationsHeading")}</SectionLabel>
        {isLoading ? (
          <Skeleton height={64} />
        ) : !installations || installations.length === 0 ? (
          <EmptyState icon="Zap" title={t("ciTab.emptyTitle")} body={t("ciTab.empty")} />
        ) : (
          <div style={s.list}>
            {installations.map((inst) => (
              <div key={inst.id} style={s.row}>
                <div style={s.rowMain}>
                  <span style={s.rowTitle}>{inst.repo}</span>
                  <div style={s.rowMeta}>
                    <span>{t(`exportWizard.targets.${inst.target_type}`)}</span>
                    <span>·</span>
                    <Badge
                      icon={inst.last_run_status === "failed" ? "AlertTriangle" : inst.last_run_status ? "Check" : "Dot"}
                      color={
                        inst.last_run_status === "failed"
                          ? "var(--danger)"
                          : inst.last_run_status
                            ? "var(--ok)"
                            : "var(--text-muted)"
                      }
                    >
                      {inst.last_run_status ? t(`runs.status.${statusKey(inst.last_run_status)}`) : t("ciTab.neverRan")}
                    </Badge>
                    {inst.last_run_at && <span>{new Date(inst.last_run_at).toLocaleString()}</span>}
                  </div>
                </div>
                <div style={s.rowActions}>
                  <Button
                    kind="secondary"
                    size="sm"
                    onClick={() => handleUpdate(inst.id)}
                    loading={republish.isPending}
                  >
                    {t("ciTab.update")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusKey(status: string): string {
  return status === "no_findings" ? "noFindings" : status;
}
