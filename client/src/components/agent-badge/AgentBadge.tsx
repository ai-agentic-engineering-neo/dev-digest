/* AgentBadge — colored rounded square with a Cpu icon, one color per agent (--viz-1..6).
   Presentational and i18n-free (mounted in /showcase): the caller passes the translated label. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export type AgentBadgeProps = {
  colorIndex: number;
  size?: number;
  /** Accessible name; when omitted the badge is decorative (aria-hidden). */
  label?: string;
};

export function AgentBadge({ colorIndex, size = 28, label }: AgentBadgeProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <span style={s.badge(colorIndex, size)} {...a11y}>
      <Icon.Cpu size={Math.round(size * 0.55)} />
    </span>
  );
}

export default AgentBadge;
