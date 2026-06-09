import React from "react";
import { Icon } from "../icons";
import { NAV, SETTINGS_ITEM } from "../nav";
import { DefaultLink } from "./DefaultLink";
import type { ShellContext } from "./types";
import { NavItem } from "./NavItem";
import { RepoSwitcher } from "./RepoSwitcher";

export function Sidebar({ ctx }: { ctx: ShellContext }) {
  const Link = ctx.Link ?? DefaultLink;
  return (
    <aside
      style={{
        width: 264,
        flexShrink: 0,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 14px 16px",
        gap: 2,
        overflow: "hidden",
      }}
    >
      <Link href="/">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 5px 14px" }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "var(--text-primary)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon.Layers size={15} style={{ color: "var(--bg-primary)" }} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>DevDigest</span>
        </div>
      </Link>
      <RepoSwitcher ctx={ctx} />
      <div style={{ overflowY: "auto", flex: 1, margin: "5px -5px 0", padding: "0 5px" }}>
        {NAV.map((grp, gi) => (
          <div key={gi} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                padding: "0 14px",
                marginBottom: 8,
              }}
            >
              {grp.section}
            </div>
            {grp.items.map((it) => (
              <NavItem
                key={it.key}
                item={it.key === "pulls" && ctx.prCount != null ? { ...it, badge: String(ctx.prCount) } : it}
                active={ctx.activeKey === it.key}
                repoId={ctx.repoId}
                Link={Link}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}>
        <NavItem item={SETTINGS_ITEM} active={ctx.activeKey === "settings"} repoId={ctx.repoId} Link={Link} />
      </div>
    </aside>
  );
}
