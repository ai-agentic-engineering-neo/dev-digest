/* FindingsCell — PR list FINDINGS column: open-finding counts per severity
   (over each agent's latest review) with a popover listing those findings.
   The popover opens on hover, pins on click, closes on Escape / outside click.
   It renders in a portal with fixed positioning because the table card clips
   overflow. Reviews are fetched lazily, only once the popover opens. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrMeta, Severity } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPopoverList } from "./FindingsPopoverList";
import { placePopover, popoverFindings } from "./helpers";
import { POPOVER_MAX_HEIGHT, POPOVER_WIDTH, s } from "./styles";

const COUNT_KEYS: { key: "critical" | "warning" | "suggestion"; severity: Severity }[] = [
  { key: "critical", severity: "CRITICAL" },
  { key: "warning", severity: "WARNING" },
  { key: "suggestion", severity: "SUGGESTION" },
];

/** Grace period so the pointer can travel from the trigger into the popover. */
const HOVER_CLOSE_MS = 150;

export function FindingsCell({ pr }: { pr: PrMeta }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [pos, setPos] = React.useState<ReturnType<typeof placePopover> | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = React.useId();

  const reviews = usePrReviews(pr.id, open);
  const findings = React.useMemo(
    () => popoverFindings(reviews.data, pr.latest_review_ids),
    [reviews.data, pr.latest_review_ids],
  );

  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setPos(
      placePopover(
        el.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        { width: POPOVER_WIDTH, maxHeight: POPOVER_MAX_HEIGHT },
      ),
    );
  }, []);

  const show = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  }, [place]);

  const close = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
    setPinned(false);
  }, []);

  const scheduleHoverClose = React.useCallback(() => {
    if (pinned) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }, [pinned]);

  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Escape closes; outside click closes; scroll/resize re-anchors the fixed popover.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place]);

  const counts = pr.findings;
  if (counts == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const total = counts.critical + counts.warning + counts.suggestion;
  if (total === 0) return <span style={s.none}>{t("list.findings.none")}</span>;

  return (
    // The row navigates to the PR on click — keep cell interactions local.
    <div onClick={(e) => e.stopPropagation()} onMouseEnter={show} onMouseLeave={scheduleHoverClose}>
      <button
        ref={triggerRef}
        type="button"
        style={s.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={t("list.findings.ariaLabel", counts)}
        onClick={() => {
          if (pinned) return close();
          show();
          setPinned(true);
        }}
      >
        {COUNT_KEYS.filter(({ key }) => counts[key] > 0).map(({ key, severity }) => {
          const SevIcon = Icon[SEV[severity].icon];
          return (
            <span key={key} style={s.count(SEV[severity].c)} data-severity={severity}>
              <SevIcon size={13} aria-hidden />
              {counts[key]}
            </span>
          );
        })}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={t("list.findings.header", { count: total })}
            style={{ ...s.popover, ...pos }}
            onMouseEnter={show}
            onMouseLeave={scheduleHoverClose}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={s.header}>
              <Icon.Info size={13} aria-hidden />
              {t("list.findings.header", { count: total })}
            </div>
            <FindingsPopoverList
              findings={findings}
              loading={reviews.isLoading}
              error={reviews.isError}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
