import React from "react";
import { Icon } from "../icons";
import { resolveHref, type NavItemDef } from "../nav";
import { DefaultLink } from "./DefaultLink";
import type { LinkLike } from "./types";

export function NavItem({
  item,
  active,
  repoId,
  Link = DefaultLink,
}: {
  item: NavItemDef;
  active?: boolean;
  repoId?: string | null;
  Link?: LinkLike;
}) {
  const I = Icon[item.icon];
  const [h, setH] = React.useState(false);
  return (
    <Link href={resolveHref(item.href, repoId)}>
      <div
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 6,
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          cursor: "pointer",
          position: "relative",
          color: active ? "var(--text-primary)" : h ? "var(--text-primary)" : "var(--text-secondary)",
          background: active ? "var(--bg-hover)" : h ? "var(--bg-elevated)" : "transparent",
          transition: "background .12s, color .12s",
        }}
      >
        {active && (
          <span
            style={{
              position: "absolute",
              left: -8,
              top: 7,
              bottom: 7,
              width: 2.5,
              borderRadius: 2,
              background: "var(--accent)",
            }}
          />
        )}
        <I size={16} style={{ color: active ? "var(--accent)" : "inherit" }} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.badge && (
          <span
            className="tnum"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 99,
              padding: "0 8px",
              minWidth: 18,
              textAlign: "center",
            }}
          >
            {item.badge}
          </span>
        )}
      </div>
    </Link>
  );
}
