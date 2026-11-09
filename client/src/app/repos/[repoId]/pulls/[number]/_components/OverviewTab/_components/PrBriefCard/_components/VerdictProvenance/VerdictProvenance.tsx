"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

const CLOSE_DELAY_MS = 150;

/** Info control next to the verdict: where the verdict, findings and score come from. */
export function VerdictProvenance({ agentName, reviewedAt }: { agentName: string | null; reviewedAt: string }) {
  const t = useTranslations("brief");
  const format = useFormatter();
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const text = t("verdict.provenance", {
    agent: agentName ?? t("verdict.unknownAgent"),
    when: format.dateTime(new Date(reviewedAt), { dateStyle: "medium", timeStyle: "short" }),
  });

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hideNow = () => {
    cancelClose();
    setOpen(false);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => cancelClose, []);

  return (
    <span style={s.root} onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        type="button"
        style={s.button}
        aria-label={text}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={show}
        onBlur={hideNow}
        onKeyDown={(e) => {
          if (e.key === "Escape") hideNow();
        }}
      >
        <Icon.Info size={14} aria-hidden />
      </button>
      {open && (
        <span role="tooltip" id={tooltipId} style={s.bubble}>
          {text}
        </span>
      )}
    </span>
  );
}
