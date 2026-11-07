/* FindingsPanel — severity counters/filter + hide-low-confidence + j/k navigation + FindingCard list
   grouped by severity (each group collapsible, plus expand/collapse all), wiring the accept/dismiss
   action hook (A2). Severity counters: client/specs/severity-counters.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, SeverityBadge, Toggle } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { confidentFindings, countBySeverity, groupBySeverity, visibleFindings } from "./helpers";
import { SeverityCounters } from "./_components/SeverityCounters";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counters are taken AFTER the confidence filter, so they always match the list below.
  const counts = React.useMemo(
    () => countBySeverity(confidentFindings(findings, hideLow)),
    [findings, hideLow],
  );
  // A level that dropped to 0 (e.g. hide-low-confidence hid them all) can't stay selected.
  const activeSeverity = severity && counts[severity] > 0 ? severity : null;
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, activeSeverity),
    [findings, hideLow, activeSeverity],
  );

  const groups = React.useMemo(() => groupBySeverity(shown), [shown]);

  // Expansion: only the cards the user opened/closed are stored; any other card follows the default
  // "the first visible card is open" — so after a filter change the new first card opens, as before.
  const [cardOverrides, setCardOverrides] = React.useState<Map<string, boolean>>(() => new Map());
  const [collapsed, setCollapsed] = React.useState<Set<Severity>>(() => new Set());
  // j/k walk the cards that are on screen — folded groups are skipped.
  const navigable = React.useMemo(() => shown.filter((f) => !collapsed.has(f.severity)), [shown, collapsed]);
  const isOpen = (id: string) => cardOverrides.get(id) ?? id === shown[0]?.id;
  const allOpen = shown.length > 0 && collapsed.size === 0 && shown.every((f) => isOpen(f.id));

  const selectSeverity = (next: Severity | null) => {
    setSeverity(next);
    setFocusIdx(0);
  };

  const toggleCard = (id: string) => {
    const open = isOpen(id);
    setCardOverrides((prev) => new Map(prev).set(id, !open));
  };

  const toggleGroup = (sev: Severity) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
    setFocusIdx(0);
  };

  // One click: fold every group down to its header + count, or open every group and card.
  const toggleAll = () => {
    setCollapsed(allOpen ? new Set(groups.map((g) => g.severity)) : new Set());
    setCardOverrides((prev) => {
      const next = new Map(prev);
      for (const f of shown) next.set(f.id, !allOpen);
      return next;
    });
    setFocusIdx(0);
  };

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Nothing on screen (e.g. every group folded): j/k must not move the focus to -1.
      if (navigable.length === 0) return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, navigable.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && navigable[focusIdx]) {
        action.mutate({ findingId: navigable[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigable, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {findings.length > 0 && (
          <SeverityCounters
            counts={counts}
            active={activeSeverity}
            onSelect={selectSeverity}
            labels={{
              group: t("panel.severityFilter"),
              showOnly: (sev) => t("panel.showOnly", { severity: sev }),
            }}
          />
        )}
        <div style={s.toggleGroup}>
          {shown.length > 0 && (
            <Button kind="ghost" size="sm" onClick={toggleAll}>
              {allOpen ? t("panel.collapseAll") : t("panel.expandAll")}
            </Button>
          )}
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          groups.map((g) => {
            const open = !collapsed.has(g.severity);
            return (
              <section key={g.severity} style={s.group}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={t("panel.toggleGroup", { severity: g.severity, count: g.findings.length })}
                  onClick={() => toggleGroup(g.severity)}
                  style={s.groupHeader}
                >
                  <Icon.ChevronDown size={15} style={s.chevron(open)} />
                  <SeverityBadge severity={g.severity} count={g.findings.length} />
                  <span>{t("panel.groupCount", { count: g.findings.length })}</span>
                  <span style={s.groupRule} />
                </button>
                {open &&
                  g.findings.map((f) => (
                    <FindingCard
                      key={f.id}
                      f={f}
                      focused={navigable[focusIdx]?.id === f.id}
                      expanded={isOpen(f.id)}
                      onToggle={() => toggleCard(f.id)}
                      pending={action.isPending}
                      repoFullName={repoFullName}
                      headSha={headSha}
                      onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
                    />
                  ))}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
