/* ContextRepoState — why a repo's project-context docs are unavailable or may be stale, with a
   Resync action. "blocking" replaces the doc list (repo not cloned); "banner" sits above a list
   that still works (code index failed / degraded). Presentational: labels arrive translated. */
import React from "react";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

export interface ContextRepoStateProps {
  variant: "blocking" | "banner";
  title: string;
  body: string;
  actionLabel: string;
  busy?: boolean;
  onAction: () => void;
}

export function ContextRepoState({ variant, title, body, actionLabel, busy, onAction }: ContextRepoStateProps) {
  if (variant === "banner") {
    return (
      <div role="status" style={s.banner}>
        <Icon.AlertTriangle size={16} style={s.bannerIcon} />
        <div style={s.bannerText}>
          <span style={s.bannerTitle}>{title}</span>
          <span style={s.bannerBody}>{body}</span>
        </div>
        <Button size="sm" icon="RefreshCw" loading={busy} onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    );
  }
  return (
    <div style={s.blocking}>
      <Icon.Folder size={24} style={s.blockingIcon} />
      <div style={s.blockingTitle}>{title}</div>
      <div style={s.blockingBody}>{body}</div>
      <div style={s.blockingAction}>
        <Button icon="RefreshCw" loading={busy} onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
