/* SeverityCounts — compact per-severity counts ("⚠ 2  💡 1") for a set of
   findings: a review run's header on the PR page, and the Findings column of the
   PR list. Hovering or clicking a count opens a popover with those findings.
   Pure UI over already-loaded findings: no request, no model call. The popover
   is portalled to <body> because both hosts clip overflow (the run accordion)
   or are clickable rows. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Icon,
  SEV,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  type Severity as UiSeverity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_LEVELS, countBySeverity, sortBySeverity } from "@/lib/severity";
import { githubBlobUrl } from "@/lib/github-urls";
import { POPOVER_WIDTH, s, triggerStyle } from "./styles";

/** Grace period so the pointer can travel from a count into the popover. */
const CLOSE_DELAY_MS = 150;
const VIEWPORT_MARGIN = 8;
const GAP = 6;

export function SeverityCounts({
  findings,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const sorted = React.useMemo(() => sortBySeverity(findings), [findings]);

  const [open, setOpen] = React.useState(false);
  /** Opened by click: stays open until clicked again, Escape, or an outside click. */
  const [pinned, setPinned] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const anchorRef = React.useRef<HTMLSpanElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const popId = React.useId();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const close = React.useCallback(() => {
    cancelClose();
    setOpen(false);
    setPinned(false);
  }, []);
  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };

  // Anchor the popover under the counts (above them when there's no room
  // below); follow scroll/resize while open.
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const h = popRef.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - r.bottom;
      const flip = spaceBelow < h + GAP + VIEWPORT_MARGIN && r.top > spaceBelow;
      const top = flip ? Math.max(VIEWPORT_MARGIN, r.top - GAP - h) : r.bottom + GAP;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN;
      setPos({ top, left: Math.max(VIEWPORT_MARGIN, Math.min(r.left, maxLeft)) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Escape or a click outside the counts and the popover closes it.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || popRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  React.useEffect(() => cancelClose, []);

  if (findings.length === 0) return null;

  return (
    // Both hosts react to clicks (the run header toggles its accordion on click /
    // Enter / Space; a PR list row navigates). Events from the counts and the
    // portalled popover bubble here through the React tree, so stop them.
    <span
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") close();
      }}
    >
      <span
        ref={anchorRef}
        role="group"
        aria-label={t("severityCounts.groupLabel")}
        style={s.group}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
      >
        {SEVERITY_LEVELS.filter((sev) => counts[sev] > 0).map((sev) => {
          const I = Icon[SEV[sev].icon];
          return (
            <button
              key={sev}
              type="button"
              aria-label={t("severityCounts.trigger", { count: counts[sev], label: SEV[sev].label })}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? popId : undefined}
              onClick={() => {
                if (pinned) close();
                else {
                  show();
                  setPinned(true);
                }
              }}
              style={triggerStyle(sev)}
            >
              <I size={13} aria-hidden="true" />
              <span className="tnum">{counts[sev]}</span>
            </button>
          );
        })}
      </span>

      {open &&
        createPortal(
          <div
            ref={popRef}
            id={popId}
            role="dialog"
            aria-label={t("severityCounts.title", { count: findings.length })}
            style={s.popover(pos.top, pos.left)}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div style={s.heading}>
              <Icon.AlertOctagon size={13} aria-hidden="true" />
              {t("severityCounts.title", { count: findings.length })}
            </div>
            <ul style={s.list}>
              {sorted.map((f, i) => {
                const href =
                  repoFullName && headSha
                    ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
                    : undefined;
                const status = f.accepted_at
                  ? t("finding.accepted")
                  : f.dismissed_at
                    ? t("finding.dismissed")
                    : null;
                return (
                  <li key={f.id} style={s.item(i === 0, status !== null)}>
                    <div style={s.titleRow}>
                      <SeverityBadge severity={f.severity as UiSeverity} compact />
                      <span style={s.title} title={f.title}>
                        {f.title}
                      </span>
                      <CategoryTag category={f.category as Category} />
                      {status && <span style={s.statusTag}>{status}</span>}
                    </div>
                    <div style={s.metaRow}>
                      <MonoLink href={href}>
                        {f.file}:{f.start_line === f.end_line ? f.start_line : `${f.start_line}-${f.end_line}`}
                      </MonoLink>
                      <ConfidenceNum value={f.confidence} />
                    </div>
                    {f.rationale && <div style={s.rationale}>{f.rationale}</div>}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </span>
  );
}
