/* ConfigureRunView — the Multi-Agent Review landing page (T13): step 1 picks
   a pull request, step 2 (disabled until a PR is chosen, AC-5) lists
   selectable agent cards with a teaser + per-agent estimate (AC-6), a
   client-computed summary (AC-7, `summariseEstimate`), and a run action that
   creates the multi-agent run and navigates to its results view. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Checkbox, EmptyState, Icon, SearchableSelect, SelectInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/contexts/repoContext";
import { useAgents, usePulls, useTriggerMultiAgentRun } from "@/lib/hooks";
import { summariseEstimate } from "@/lib/utils/multiAgentEstimate";
import { formatCost, formatSeconds } from "../format";
import { withDefaultsChecked } from "./helpers";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("multiAgentReview");
  const router = useRouter();
  // useActiveRepo() sources its own `repos` fetch (RepoProvider mounts
  // useRepos() at the app root) — a sensible default for this GLOBAL page's
  // repo picker, even though the route itself carries no :repoId.
  const { activeRepo, repos } = useActiveRepo();

  const [repoId, setRepoId] = React.useState<string | null>(null);
  const effectiveRepoId = repoId ?? activeRepo?.id ?? repos[0]?.id ?? null;

  const { data: pulls } = usePulls(effectiveRepoId);
  const [prId, setPrId] = React.useState<string | null>(null);

  const { data: agents } = useAgents();
  const enabledAgents = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);

  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    setChecked((prev) => withDefaultsChecked(enabledAgents, prev));
  }, [enabledAgents]);

  const trigger = useTriggerMultiAgentRun();

  const prOptions = (pulls ?? [])
    .filter((p): p is typeof p & { id: string } => !!p.id)
    .map((p) => ({ value: p.id, label: `#${p.number} · ${p.title}` }));

  const selectedPr = (pulls ?? []).find((p) => p.id === prId) ?? null;
  const checkedAgents = enabledAgents.filter((a) => checked[a.id]);
  const checkedCount = checkedAgents.length;
  const estimate = summariseEstimate(checkedAgents);
  const hasEstimate = estimate.total_time_ms > 0 || estimate.total_cost_usd > 0;

  const toggleAgent = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleRun = async () => {
    if (!prId || checkedCount === 0) return;
    const res = await trigger.mutateAsync({ prId, agentIds: checkedAgents.map((a) => a.id) });
    router.push(`/multi-agent-review/${res.pr_id}?multiRunId=${res.id}`);
  };

  return (
    <AppShell crumb={[{ label: t("crumbLabel") }, { label: t("crumb") }]}>
      <div style={s.page}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            {t("title")}
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>{t("subtitle")}</p>
        </div>

        <div style={s.step}>
          <div style={s.stepHeader}>
            <span style={s.stepNumber}>{t("step1Number")}</span>
            <span style={s.stepTitle}>{t("step1Title")}</span>
          </div>
          <div style={s.pickerRow}>
            <div style={s.pickerCol}>
              <SelectInput
                mono={false}
                value={effectiveRepoId ?? ""}
                onChange={(v) => {
                  setRepoId(v);
                  setPrId(null);
                }}
                options={repos.map((r) => ({ value: r.id, label: r.full_name }))}
              />
            </div>
            <div style={{ flex: 2, minWidth: 0 }}>
              <SearchableSelect
                mono={false}
                value={prId ?? ""}
                onChange={setPrId}
                options={prOptions}
                placeholder={t("prPlaceholder")}
              />
            </div>
          </div>
        </div>

        <div style={s.step}>
          <div style={s.stepHeader}>
            <span style={s.stepNumber}>{t("step2Number")}</span>
            <span style={s.stepTitle}>{t("step2Title")}</span>
          </div>

          {!selectedPr ? (
            <EmptyState icon="GitPullRequest" title={t("step2EmptyTitle")} body={t("step2EmptyBody")} />
          ) : (
            <>
              {enabledAgents.length === 0 ? (
                <EmptyState icon="Cpu" title={t("noAgentsTitle")} body={t("noAgentsBody")} />
              ) : (
                <div style={s.agentList}>
                  {enabledAgents.map((a) => (
                    <Card key={a.id} pad={false}>
                      <div style={s.agentCard}>
                        <Checkbox checked={!!checked[a.id]} onChange={() => toggleAgent(a.id)} />
                        <div style={s.agentMain}>
                          <span style={s.agentName}>{a.name}</span>
                          {a.description && <span style={s.agentTeaser}>{a.description}</span>}
                        </div>
                        <span style={s.agentEstimate}>
                          {a.has_history && a.est_duration_ms != null && a.est_cost_usd != null
                            ? t("agentEstimate", {
                                time: formatSeconds(a.est_duration_ms),
                                cost: formatCost(a.est_cost_usd),
                              })
                            : t("noHistory")}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <div style={s.summaryBar}>
                <span style={s.summaryText}>
                  {hasEstimate
                    ? t("summary", {
                        time: formatSeconds(estimate.total_time_ms),
                        cost: formatCost(estimate.total_cost_usd),
                      })
                    : t("summaryNoEstimate")}
                </span>
              </div>

              <div style={s.footer}>
                <button type="button" style={s.configureLink} onClick={() => router.push("/agents")}>
                  <Icon.Settings size={13} />
                  {t("configureAgentsLink")}
                </button>
                <Button
                  kind="primary"
                  icon="Sparkles"
                  loading={trigger.isPending}
                  disabled={checkedCount === 0 || trigger.isPending}
                  onClick={handleRun}
                >
                  {t("runAction", { count: checkedCount })}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
