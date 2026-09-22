/* TraceSection — collapsible titled section used throughout the trace tab. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "../../styles";

export function TraceSection({
  icon,
  title,
  right,
  children,
  defaultOpen = true,
}: {
  icon: "Settings" | "Gauge" | "FileText" | "Wrench" | "Code" | "AlertOctagon";
  title: string;
  /** Non-interactive adornment (e.g. a count Badge) — it sits inside the toggle button. */
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const I = Icon[icon];
  const bodyId = React.useId();
  return (
    <div style={s.section}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        style={s.sectionHead}
      >
        <I size={15} style={s.sectionIcon} />
        <span style={s.sectionTitle}>{title}</span>
        {right}
        <Icon.ChevronDown size={15} style={s.chevron(open)} />
      </button>
      {open && (
        <div id={bodyId} style={s.sectionBody}>
          {children}
        </div>
      )}
    </div>
  );
}
