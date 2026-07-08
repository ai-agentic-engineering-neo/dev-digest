/* CiTab — Continuous Integration tab for the Agent Editor (T10).
   Shows, per target repository: the installation status + workflow version
   plus that installation's CI run history (AC-34); a "Fail CI on" gate
   selector that persists via `useUpdateAgent` (AC-35); an "Add to CI"
   button that opens the Export Wizard (AC-1); and an "Update CI config"
   action that re-runs the export against the existing installation
   (AC-11, client side).

   Run history: there is no per-installation runs endpoint yet, so this
   reuses the existing global `useCiRuns()` (`GET /ci/runs`, built for the
   T11 CI Runs page) and filters client-side by `ci_installation_id` —
   avoids adding a new hook/endpoint for a slice this task doesn't own.

   i18n: reuses the pre-existing `ci.json` `ciTab` / `exportWizard.targets` /
   `runs.*` keys wherever they fit (do NOT add keys to ci.json — T9's file).
   `CiInstallationStatus` ("active"/"pr_open"/"error") and the "Run history"
   section label have no matching keys in the namespace yet, so literal
   English fallbacks are used for those (flagged in the implementer report). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, FormField, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation, CiRun } from "@devdigest/shared";
import { useCiInstallations, useExportCi } from "@/lib/hooks/ci";
import { useCiRuns } from "@/lib/hooks/ci-runs";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { CI_FAIL_ON_VALUES } from "../ConfigTab/constants";
import { ExportWizard } from "./ExportWizard";

// Literal fallbacks for copy missing from the `ci.json` namespace (see file
// header note) — replace with real i18n keys once Track D extends `ciTab`.
const FALLBACK = {
  status: { active: "Active", pr_open: "PR open", error: "Error" } as Record<string, string>,
  runHistory: "Run history",
  noRuns: "No runs yet.",
  loadError: "Could not load CI installations.",
};

const STATUS_COLOR: Record<string, string> = {
  active: "var(--ok)",
  pr_open: "var(--warn)",
  error: "var(--crit)",
};

const RUN_STATUS_KEY: Record<string, string> = {
  succeeded: "succeeded",
  failed: "failed",
  running: "running",
  no_findings: "noFindings",
};

const RUN_STATUS_COLOR: Record<string, string> = {
  succeeded: "var(--ok)",
  failed: "var(--crit)",
  running: "var(--accent)",
  no_findings: "var(--text-muted)",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Run history for one installation — filtered client-side from the global
 *  CI runs list by `ci_installation_id`. */
function RunHistory({ runs, tCi }: { runs: CiRun[]; tCi: (key: string) => string }) {
  if (runs.length === 0) {
    return <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>{FALLBACK.noRuns}</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
      <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
        {FALLBACK.runHistory}
      </caption>
      <thead>
        <tr>
          {["timestamp", "pullRequest", "status", "findings", "cost"].map((col) => (
            <th
              key={col}
              scope="col"
              style={{
                textAlign: "left",
                padding: "6px 8px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {tCi(`runs.table.${col}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td style={{ padding: "6px 8px", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
              {formatTimestamp(run.ran_at)}
            </td>
            <td style={{ padding: "6px 8px", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
              {run.pr_number != null ? `#${run.pr_number}` : "–"}
            </td>
            <td style={{ padding: "6px 8px", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
              {run.status ? (
                <Badge color={RUN_STATUS_COLOR[run.status] ?? "var(--text-muted)"}>
                  {RUN_STATUS_KEY[run.status] ? tCi(`runs.status.${RUN_STATUS_KEY[run.status]}`) : run.status}
                </Badge>
              ) : (
                "–"
              )}
            </td>
            <td style={{ padding: "6px 8px", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
              {run.findings_count ?? "–"}
            </td>
            <td style={{ padding: "6px 8px", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
              {run.cost_usd != null && run.cost_usd > 0 ? `$${run.cost_usd.toFixed(3)}` : "–"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InstallationCard({
  installation,
  runs,
  onUpdate,
  updating,
  tCi,
}: {
  installation: CiInstallation;
  runs: CiRun[];
  onUpdate: () => void;
  updating: boolean;
  tCi: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
        background: "var(--bg-elevated)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{installation.repo}</span>
        <Badge color="var(--text-secondary)" mono>
          {tCi(`exportWizard.targets.${installation.target_type}`)}
        </Badge>
        <Badge color={STATUS_COLOR[installation.status] ?? "var(--text-muted)"}>
          {FALLBACK.status[installation.status] ?? installation.status}
        </Badge>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          v{installation.workflow_version} · {tCi("ciTab.installed", { date: formatDate(installation.installed_at) })}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={updating} onClick={onUpdate}>
            {tCi("ciTab.update")}
          </Button>
        </div>
      </div>
      <RunHistory runs={runs} tCi={tCi} />
    </div>
  );
}

export function CiTab({ agent }: { agent: Agent }) {
  const tAgents = useTranslations("agents");
  const tCi = useTranslations("ci");
  const updateAgent = useUpdateAgent();
  const exportCi = useExportCi(agent.id);

  const [ciFailOn, setCiFailOn] = React.useState<CiFailOn>(agent.ci_fail_on);
  React.useEffect(() => setCiFailOn(agent.ci_fail_on), [agent.id, agent.ci_fail_on]);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const {
    data: installations,
    isLoading: installationsLoading,
    isError: installationsError,
    refetch,
  } = useCiInstallations(agent.id);
  const { data: allRuns } = useCiRuns();

  const runsByInstallation = React.useMemo(() => {
    const map = new Map<string, CiRun[]>();
    for (const run of allRuns ?? []) {
      if (!run.ci_installation_id) continue;
      const list = map.get(run.ci_installation_id) ?? [];
      list.push(run);
      map.set(run.ci_installation_id, list);
    }
    return map;
  }, [allRuns]);

  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({
    value: v,
    label: tAgents(`config.ciFailOnOptions.${v}`),
  }));

  const handleFailOnChange = (v: string) => {
    const next = v as CiFailOn;
    setCiFailOn(next);
    updateAgent.mutate({ id: agent.id, patch: { ci_fail_on: next } });
  };

  const handleUpdateInstallation = (installation: CiInstallation) => {
    setUpdatingId(installation.id);
    exportCi.mutate(
      { repo: installation.repo, target: installation.target_type, action: "open_pr" },
      { onSettled: () => setUpdatingId(null) },
    );
  };

  return (
    <div style={{ padding: 28, maxWidth: 820, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>{tCi("ciTab.heading")}</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{tCi("ciTab.subtitle")}</p>
        </div>
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setWizardOpen(true)}>
          {tCi("ciTab.exportToCi")}
        </Button>
      </div>

      <div style={{ maxWidth: 360 }}>
        <FormField label={tAgents("config.ciFailOn")} hint={tAgents("config.ciFailOnHint")}>
          <SelectInput value={ciFailOn} onChange={handleFailOnChange} options={ciFailOnOptions} />
        </FormField>
      </div>

      {installationsLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      )}

      {installationsError && <ErrorState body={FALLBACK.loadError} onRetry={() => refetch()} />}

      {!installationsLoading && !installationsError && (installations?.length ?? 0) === 0 && (
        <EmptyState
          icon="Workflow"
          title={tCi("ciTab.heading")}
          body={tCi("ciTab.empty")}
          cta={tCi("ciTab.exportToCi")}
          onCta={() => setWizardOpen(true)}
        />
      )}

      {!installationsLoading && !installationsError && (installations?.length ?? 0) > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(installations ?? []).map((installation) => (
            <InstallationCard
              key={installation.id}
              installation={installation}
              runs={runsByInstallation.get(installation.id) ?? []}
              onUpdate={() => handleUpdateInstallation(installation)}
              updating={updatingId === installation.id && exportCi.isPending}
              tCi={tCi}
            />
          ))}
        </div>
      )}

      {wizardOpen && (
        <ExportWizard agentId={agent.id} agentName={agent.name} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}
