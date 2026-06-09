"use client";

import { EmptyState } from "@devdigest/ui";

interface MountPointProps {
  title: string;
  owner: string;
  icon?: any;
}

/** Mount point a feature agent (A3/A4) replaces with its real screen. */
export function MountPoint({ title, owner, icon = "Boxes" }: MountPointProps) {
  return (
    <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 8, background: "var(--bg-surface)" }}>
      <EmptyState
        icon={icon}
        title={title}
        body={`Mount point for ${owner}. The PR-detail shell (header, tabs, routing, data) is wired by F2/A2 — ${owner} renders here.`}
      />
    </div>
  );
}
