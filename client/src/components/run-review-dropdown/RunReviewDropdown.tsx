/* RunReviewDropdown — "Run all enabled agents" / a specific agent → kicks off
   POST /pulls/:id/review and hands the resulting runIds up so the parent can
   stream SSE live status.

   Lives in `src/components/` (not a route-local `_components/`) because it is
   used from TWO routes: the PR detail header and the PR list's Actions column.
   The list usage passes `kind="ghost"` (a quiet outlined "Run Review ⌄" that
   brightens on hover, per the design) and `menuPortal` (the list's table card
   is `overflow: hidden`, which would clip an in-place absolutely-positioned
   menu on the bottom rows). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useRunReview } from "@/lib/hooks/reviews";
import { DROPDOWN_WIDTH } from "./constants";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  menuPortal = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  /** `ghost` = the PR list's quiet outlined trigger; hover highlight comes
   *  from the shared Button primitive. */
  kind?: "primary" | "secondary" | "ghost";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Render the menu into document.body — required inside an `overflow: hidden`
   *  container such as the PR list's table card. */
  menuPortal?: boolean;
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
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      onRunSettled?.();
    }
  };

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

  const label = run.isPending ? t("runReview.running") : t("runReview.runReview");

  return (
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      portal={menuPortal}
      items={items}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : t("runReview.runReview")}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
            {label}
          </Button>
        </span>
      }
    />
  );
}
