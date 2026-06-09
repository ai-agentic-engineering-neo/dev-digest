import React from "react";
import { Icon } from "../icons";
import { Dropdown, type DropdownItemDef } from "../kit";
import type { ShellContext } from "./types";

export function RepoSwitcher({ ctx }: { ctx: ShellContext }) {
  const active = ctx.activeRepo;
  const items: DropdownItemDef[] = [
    ...(ctx.repos ?? []).map((r) => ({
      label: r.full_name,
      icon: "GitBranch" as const,
      onClick: () => ctx.onSelectRepo?.(r.id),
      ...(ctx.onRemoveRepo
        ? { onRemove: () => ctx.onRemoveRepo!(r.id), removeLabel: `Remove ${r.full_name}` }
        : {}),
    })),
    ...(ctx.repos && ctx.repos.length ? [{ divider: true }] : []),
    { label: "Add repository…", icon: "Plus", muted: true, onClick: () => ctx.onAddRepo?.() },
  ];
  return (
    <Dropdown
      align="left"
      width={240}
      items={items}
      trigger={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            margin: "0 0 8px",
            borderRadius: 7,
            border: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon.GitBranch size={14} style={{ color: "#fff" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {active?.full_name ?? "No repo selected"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {active ? `${active.default_branch ?? "main"} · ${active.syncedLabel ?? "not synced"}` : "Add a repo to begin"}
            </div>
          </div>
          <Icon.ChevronsUpDown size={14} style={{ color: "var(--text-muted)" }} />
        </div>
      }
    />
  );
}
