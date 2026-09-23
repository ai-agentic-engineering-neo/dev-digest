/* RunReviewDropdown — the Run Review agent picker.
   Pick one, two, several or all agents; one click fans the selection out into
   one agent_run each (POST /pulls/:id/review { agentIds }) and hands the run
   ids up so the parent can stream SSE live status.

   Why this renders its own popover instead of the vendored <Dropdown>:
   kit/Dropdown.tsx closes the menu after EVERY item click and DropdownItemDef
   has no checked/checkbox concept, so it cannot host a multi-select list —
   and src/vendor/ui is do-not-touch. The panel below mirrors Dropdown's own
   mechanics and tokens so the two read as the same primitive.
   Spec: client/specs/multi-agent-selection.md */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { DROPDOWN_WIDTH } from "./constants";
import { s } from "./styles";
import { defaultSelection, isAllSelected, runLabel, selectAll, toggleAgent } from "./helpers";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
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
  const all = React.useMemo(() => agents ?? [], [agents]);

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // Seed the selection from the enabled agents — this default IS the old
  // "Run all enabled agents" row, so running everything stays one click.
  // Re-seeds whenever the agent list itself changes (created/deleted/toggled),
  // never on a user's tick, which is what the untouched `selected` guards.
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const signature = all.map((a) => `${a.id}:${a.enabled}`).join(",");
    if (seededFor.current === signature) return;
    seededFor.current = signature;
    setSelected(defaultSelection(all));
  }, [all]);

  // Same outside-click close as kit/Dropdown.tsx.
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const everySelected = isAllSelected(all, selected);
  const label = runLabel(all, selected);

  const kick = async () => {
    if (selected.length === 0) return;
    setOpen(false);
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, agentIds: selected });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      // Back to the default pick, so reopening the menu never silently
      // repeats the previous selection.
      setSelected(defaultSelection(all));
      onRunSettled?.();
    }
  };

  return (
    <div ref={wrapRef} style={s.wrap}>
      <div onClick={() => setOpen((o) => !o)}>
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button
            kind={kind}
            size={size}
            iconRight="ChevronDown"
            icon="Sparkles"
            loading={run.isPending}
          >
            {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      </div>

      {open && (
        <div style={{ ...s.panel, width: DROPDOWN_WIDTH }}>
          {/* Merged/closed PRs can still be reviewed (informational only); lead
              with a muted, non-actionable warning so the intent is clear. */}
          {warnMerged && (
            <>
              <div style={s.mergedWarning}>
                <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <span>{t("runReview.mergedWarning")}</span>
              </div>
              <div style={s.divider} />
            </>
          )}

          {all.length === 0 ? (
            <button type="button" style={s.empty} onClick={() => router.push("/agents")}>
              <Icon.Plus size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span>{t("runReview.noAgents")}</span>
            </button>
          ) : (
            <>
              <div style={s.header}>
                <span style={s.headerLabel}>{t("runReview.pickAgents")}</span>
                <button
                  type="button"
                  style={s.headerAction}
                  onClick={() => setSelected(everySelected ? [] : selectAll(all))}
                >
                  {everySelected ? t("runReview.clearAll") : t("runReview.selectAll")}
                </button>
              </div>

              <div style={s.list} role="group" aria-label={t("runReview.pickAgents")}>
                {all.map((a) => (
                  <label
                    key={a.id}
                    style={{ ...s.row, ...(hovered === a.id ? s.rowHover : null) }}
                    onMouseEnter={() => setHovered(a.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <input
                      type="checkbox"
                      style={s.checkbox}
                      checked={selected.includes(a.id)}
                      onChange={() => setSelected((sel) => toggleAgent(sel, a.id))}
                    />
                    <span style={s.rowBody}>
                      <span style={s.rowTop}>
                        <span style={s.rowName}>{a.name}</span>
                        {/* A disabled agent is still pickable — `enabled` only
                            decides what starts ticked, not what may be run. */}
                        <span style={s.rowMeta}>
                          {a.enabled ? a.model : t("runReview.disabledHint", { model: a.model })}
                        </span>
                      </span>
                      {a.description && <span style={s.rowDescription}>{a.description}</span>}
                    </span>
                  </label>
                ))}
              </div>

              <div style={s.divider} />
              <div style={s.footer}>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Users"
                  full
                  disabled={selected.length === 0}
                  onClick={kick}
                >
                  {t(`runReview.${label.key}`, label.values)}
                </Button>
              </div>
            </>
          )}

          <div style={s.divider} />
          <button type="button" style={s.configure} onClick={() => router.push("/agents")}>
            <Icon.Settings size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span>{t("runReview.configureAgents")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
