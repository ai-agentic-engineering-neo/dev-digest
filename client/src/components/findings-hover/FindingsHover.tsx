/* FindingsHover — per-severity counters ("⊘ 2  △ 2  💡 2") with a hover popover
   "N FINDINGS IN THIS RUN" listing that run's findings read-only. Used on the PR
   list (FINDINGS column) and on the PR timeline's run tiles. Counters are not
   clickable — filtering lives in the Review runs accordion. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsTooltip } from "./FindingsTooltip";
import type { SeverityCount } from "./helpers";
import { s } from "./styles";

export function FindingsHover({
  counts,
  items,
  loading,
  onShow,
  up,
  width,
}: {
  counts: SeverityCount[];
  /** The run's findings; undefined until loaded (the popover says "Loading…"). */
  items: FindingRecord[] | undefined;
  loading?: boolean;
  /** Fires on first hover — lets the PR list fetch the findings lazily. */
  onShow?: () => void;
  up?: boolean;
  width?: number;
}) {
  const [show, setShow] = React.useState(false);
  if (counts.length === 0) return null;
  const total = counts.reduce((n, c) => n + c.count, 0);
  const open = () => {
    setShow(true);
    onShow?.();
  };
  return (
    <div
      style={s.wrap}
      onMouseEnter={open}
      onMouseLeave={() => setShow(false)}
      onFocus={open}
      onBlur={() => setShow(false)}
      tabIndex={0}
      aria-label={counts.map((c) => `${c.count} ${c.severity.toLowerCase()}`).join(", ")}
    >
      {counts.map(({ severity, count }) => {
        const sev = SEV[severity];
        const I = Icon[sev.icon];
        return (
          <span key={severity} style={s.count(sev.c)}>
            <I size={12} />
            <span className="tnum">{count}</span>
          </span>
        );
      })}
      {show && <FindingsTooltip items={items} total={total} loading={loading} up={up} width={width} />}
    </div>
  );
}
