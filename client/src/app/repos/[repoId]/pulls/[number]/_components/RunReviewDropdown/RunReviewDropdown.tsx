/* RunReviewDropdown — ported from components2.jsx.
   "Run all enabled agents" / a specific agent → kicks off POST /pulls/:id/review.
   useRunReview refreshes the PR's live runs on success, so the parent picks the
   new runs up from the server; a failure is toasted by the global error policy. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { DROPDOWN_WIDTH } from "./constants";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents, isLoading: agentsLoading, isError: agentsError } = useAgents();
  const run = useRunReview();
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  const kick = (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    run.mutate({ prId, ...opts }, { onSettled: () => onRunSettled?.() });
  };

  // List EVERY agent (not just enabled) so they're always visible; a specific
  // agent can be run regardless of its enabled flag. "Run all" still targets
  // only enabled agents.
  // Loading and failed are not "no agents": say which, and only offer to create
  // an agent once the list has loaded empty.
  const agentsPlaceholder: DropdownItemDef = agentsLoading
    ? { label: t("runReview.agentsLoading"), icon: "RefreshCw", muted: true }
    : agentsError
      ? { label: t("runReview.agentsError"), icon: "AlertTriangle", muted: true }
      : { label: t("runReview.noAgents"), icon: "Plus", muted: true, onClick: () => router.push("/agents") };

  const agentItems: DropdownItemDef[] = all.length
    ? all.map((a) => ({
        label: a.name,
        icon: "Cpu" as const,
        hint: a.enabled ? a.model : `${a.model} · disabled`,
        onClick: () => kick({ agentId: a.id }),
      }))
    : [agentsPlaceholder];

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
    ...agentItems,
    { divider: true },
    { label: t("runReview.configureAgents"), icon: "Settings", muted: true, onClick: () => router.push("/agents") },
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
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
            {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    />
  );
}
