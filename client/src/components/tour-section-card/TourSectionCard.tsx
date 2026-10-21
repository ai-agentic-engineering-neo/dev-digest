"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

interface TourSectionCardProps {
  /** Anchor id: the URL hash and the TOC both point at it. */
  id: string;
  title: string;
  icon: IconName;
  collapseLabel: string;
  expandLabel: string;
  children?: React.ReactNode;
}

/** One tour section: icon tile, title, collapse chevron, collapsible body. */
export function TourSectionCard({ id, title, icon, collapseLabel, expandLabel, children }: TourSectionCardProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const I = Icon[icon];
  return (
    <section id={id} style={s.card} aria-labelledby={`${id}-title`}>
      <div style={s.head}>
        <span style={s.tile} aria-hidden>
          <I size={16} />
        </span>
        <h2 id={`${id}-title`} style={s.title}>
          {title}
        </h2>
        <button
          type="button"
          style={s.chevron(collapsed)}
          aria-expanded={!collapsed}
          aria-controls={`${id}-body`}
          aria-label={collapsed ? expandLabel : collapseLabel}
          onClick={() => setCollapsed((c) => !c)}
        >
          <Icon.ChevronDown size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
      </div>
      <div id={`${id}-body`} style={s.body} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
