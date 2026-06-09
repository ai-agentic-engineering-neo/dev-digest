import React from "react";
import { Icon } from "../icons";
import { IconBtn, Avatar, Kbd } from "../primitives";
import { DefaultLink } from "./DefaultLink";
import type { ShellContext, Crumb } from "./types";

export function Topbar({ ctx, crumb = [] }: { ctx: ShellContext; crumb?: Crumb[] }) {
  const Link = ctx.Link ?? DefaultLink;
  return (
    <header
      style={{
        height: 52,
        flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-primary)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {crumb.map((c, i) => {
          const last = i === crumb.length - 1;
          const text = (
            <span
              className={c.mono ? "mono" : undefined}
              style={{
                fontSize: 14,
                fontWeight: last ? 600 : 500,
                color: last ? "var(--text-primary)" : "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </span>
          );
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <Icon.ChevronRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              )}
              {c.href ? <Link href={c.href}>{text}</Link> : text}
            </React.Fragment>
          );
        })}
      </div>
      <button
        onClick={ctx.onOpenCommandPalette}
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: 260,
          padding: "8px 14px",
          borderRadius: 7,
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        <Icon.Search size={14} />
        <span style={{ flex: 1, textAlign: "left" }}>Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      {ctx.onToggleTheme && (
        <IconBtn
          icon={ctx.theme === "light" ? "Moon" : "Sun"}
          label="Toggle theme"
          onClick={ctx.onToggleTheme}
        />
      )}
      {ctx.onRefresh && <IconBtn icon="RefreshCw" label="Refresh" onClick={ctx.onRefresh} />}
      <IconBtn icon="Bell" label="Notifications" />
      <Avatar name="you" size={26} />
    </header>
  );
}
