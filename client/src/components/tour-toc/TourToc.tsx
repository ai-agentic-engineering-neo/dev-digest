"use client";

import React from "react";
import { s } from "./styles";

export interface TourTocItem {
  id: string;
  label: string;
}

interface TourTocProps {
  title: string;
  items: TourTocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/** "On this page" list. Links are real anchors; scroll-spy lives in the view. */
export function TourToc({ title, items, activeId, onSelect }: TourTocProps) {
  return (
    <nav aria-label={title} style={s.nav}>
      <p style={s.title}>{title}</p>
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          style={s.link(it.id === activeId)}
          aria-current={it.id === activeId ? "location" : undefined}
          onClick={(e) => {
            e.preventDefault();
            onSelect(it.id);
          }}
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}
