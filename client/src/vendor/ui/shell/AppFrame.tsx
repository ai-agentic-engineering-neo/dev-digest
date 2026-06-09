import React from "react";
import type { ShellContext, Crumb } from "./types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppFrame({
  ctx,
  crumb,
  children,
}: {
  ctx: ShellContext;
  crumb?: Crumb[];
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        background: "var(--bg-primary)",
        alignItems: "stretch",
      }}
    >
      <Sidebar ctx={ctx} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar ctx={ctx} crumb={crumb} />
        <main style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</main>
      </div>
    </div>
  );
}
