/* RunReviewDropdown — ported from components2.jsx.
   "Run all enabled agents" / a specific agent → kicks off POST /pulls/:id/review
   and hands the resulting runIds up so the parent can stream SSE live status. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { useAgentRunEstimates, useStartMultiAgentRun } from "../../../../../../../lib/hooks/multi-agent";
import { DROPDOWN_WIDTH } from "./constants";

export function RunReviewDropdown({
  prId,
  repoId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  /** specs/13-multi-agent-review.md D23 — needed to route the new
   *  multi-select run and the "Configure agents…" row to the multi-agent
   *  surface, which is repo-scoped. */
  repoId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const run = useRunReview();
  // specs/13-multi-agent-review.md D23 — the SAME trigger the configure
  // surface uses (AC-60..62): same request shape, same multi-agent run,
  // same results surface. No second backend surface.
  const { data: estimates } = useAgentRunEstimates();
  const startMultiAgent = useStartMultiAgentRun();
  const [multiSelected, setMultiSelected] = React.useState<string[]>([]);
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);
  // D23(a) — the multi-select rows follow the mockup and offer only agents
  // that can actually be selected for a run (enabled). The EXISTING
  // single-agent rows below keep listing EVERY agent, unchanged (AC-62).
  const selectableAgents = all.filter((a) => a.enabled);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      onRunSettled?.();
    }
  };

  const kickMulti = async () => {
    onRunStart?.();
    try {
      const res = await startMultiAgent.mutateAsync({ prId, agentIds: multiSelected });
      setMultiSelected([]);
      router.push(`/repos/${repoId}/multi-agent/${res.pr_id}`);
    } finally {
      onRunSettled?.();
    }
  };

  const estimateFor = (agentId: string) => estimates?.find((e) => e.agent_id === agentId);

  // List EVERY agent (not just enabled) so they're always visible; a specific
  // agent can be run regardless of its enabled flag. "Run all" still targets
  // only enabled agents.
  const agentItems: DropdownItemDef[] = all.length
    ? all.map((a) => ({
        label: a.name,
        icon: "Cpu" as const,
        hint: a.enabled ? a.model : `${a.model} · disabled`,
        onClick: () => kick({ agentId: a.id }),
      }))
    : [{ label: "No agents yet — create one", icon: "Plus", muted: true, onClick: () => router.push("/agents") }];

  // D23 — "PICK AGENTS TO RUN" multi-select block, between "Run all" and the
  // existing per-agent rows. Rows keep the menu open (`keepOpen`) so multiple
  // agents can be toggled in one interaction (§8's additive Dropdown extension).
  const multiSelectItems: DropdownItemDef[] = selectableAgents.map((a) => {
    const checked = multiSelected.includes(a.id);
    const est = estimateFor(a.id);
    return {
      label: a.name,
      checked,
      keepOpen: true,
      // Plain formatted duration, not run through t() — same precedent as
      // this file's existing " · disabled" hint suffix above.
      hint: est?.avg_duration_ms != null ? `~${(est.avg_duration_ms / 1000).toFixed(1)}s` : undefined,
      onClick: () => setMultiSelected((cur) => (checked ? cur.filter((id) => id !== a.id) : [...cur, a.id])),
    };
  });

  const items: DropdownItemDef[] = [
    // Merged/closed PRs can still be reviewed (informational only); lead with a
    // muted, non-actionable warning so the intent is clear.
    ...(warnMerged
      ? [
          { label: t("runReview.mergedWarning"), icon: "AlertTriangle" as const, muted: true },
          { divider: true } as DropdownItemDef,
        ]
      : []),
    {
      label: t("runReview.runAll"),
      icon: "Play",
      ...(hasEnabled ? {} : { muted: true }),
      onClick: () => kick({ all: true }),
    },
    { divider: true },
    ...(selectableAgents.length
      ? ([
          { label: t("runReview.pickAgents"), muted: true, keepOpen: true } as DropdownItemDef,
          ...multiSelectItems,
          {
            label: t("runReview.clearSelection"),
            muted: multiSelected.length === 0,
            keepOpen: true,
            ...(multiSelected.length ? { onClick: () => setMultiSelected([]) } : {}),
          },
          {
            label: t("runReview.runSelected", { count: multiSelected.length }),
            icon: "Play" as const,
            muted: multiSelected.length === 0,
            ...(multiSelected.length ? { onClick: () => void kickMulti() } : { keepOpen: true }),
          },
          { divider: true } as DropdownItemDef,
        ] satisfies DropdownItemDef[])
      : []),
    ...agentItems,
    { divider: true },
    {
      label: t("runReview.configureAgents"),
      icon: "Settings",
      muted: true,
      onClick: () => router.push(`/repos/${repoId}/multi-agent?pr=${prId}`),
    },
  ];

  return (
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      items={items}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button
            kind={kind}
            size={size}
            iconRight="ChevronDown"
            icon="Sparkles"
            loading={run.isPending || startMultiAgent.isPending}
          >
            {run.isPending || startMultiAgent.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    />
  );
}
