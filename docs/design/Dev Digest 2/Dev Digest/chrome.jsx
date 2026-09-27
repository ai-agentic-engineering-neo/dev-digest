/* chrome.jsx — app shell: sidebar nav + topbar. Wraps each screen frame. */

const NAV = [
  { section: "WORKSPACE", items: [
    { key: "dashboard", label: "Pull Requests", icon: "GitPullRequest", badge: "7" },
    { key: "onboarding-tour", label: "Onboarding Tour", icon: "Boxes" },
    { key: "context", label: "Project Context", icon: "Folder" },
  ]},
  { section: "SKILLS LAB", items: [
    { key: "skills", label: "Skills", icon: "Sparkles" },
    { key: "agents", label: "Agents", icon: "Cpu" },
    { key: "conventions", label: "Conventions", icon: "ListChecks" },
    { key: "eval", label: "Eval Dashboard", icon: "Gauge" },
  ]},
  { section: "GLOBAL", items: [
    { key: "memory", label: "Memory", icon: "Database" },
    { key: "personas", label: "Multi-Agent Review", icon: "Users" },
    { key: "agent-perf", label: "Agent Performance", icon: "Activity" },
    { key: "ci-runs", label: "CI Runs", icon: "Workflow" },
  ]},
];

function NavItem({ item, active }) {
  const I = window.Icon[item.icon];
  const [h, setH] = React.useState(false);
  const on = active === item.key;
  return React.createElement("div", {
    onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: {
      display: "flex", alignItems: "center", gap: 10, padding: "6px 9px", borderRadius: 6,
      fontSize: 13, fontWeight: on ? 600 : 500, cursor: "pointer", position: "relative",
      color: on ? "var(--text-primary)" : (h ? "var(--text-primary)" : "var(--text-secondary)"),
      background: on ? "var(--bg-hover)" : (h ? "var(--bg-elevated)" : "transparent"),
      transition: "background .12s, color .12s",
    },
  },
    on && React.createElement("span", { style: { position: "absolute", left: -8, top: 7, bottom: 7, width: 2.5, borderRadius: 2, background: "var(--accent)" } }),
    React.createElement(I, { size: 16, style: { color: on ? "var(--accent)" : "inherit" } }),
    React.createElement("span", { style: { flex: 1 } }, item.label),
    item.badge && React.createElement("span", { className: "tnum", style: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 99, padding: "0 6px", minWidth: 18, textAlign: "center" } }, item.badge));
}

function RepoSwitcher() {
  return React.createElement("div", {
    style: {
      display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", margin: "0 0 6px",
      borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)", cursor: "pointer",
    },
  },
    React.createElement("div", { style: { width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "grid", placeItems: "center", flexShrink: 0 } },
      React.createElement(window.Icon.GitBranch, { size: 14, style: { color: "#fff" } })),
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, "acme/payments-api"),
      React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-muted)" } }, "main · synced 2m ago")),
    React.createElement(window.Icon.ChevronsUpDown, { size: 14, style: { color: "var(--text-muted)" } }));
}

function Sidebar({ active }) {
  return React.createElement("aside", {
    style: {
      width: 224, flexShrink: 0, background: "var(--bg-surface)", borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column", padding: "12px 12px 10px", gap: 2, overflow: "hidden",
    },
  },
    // brand
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, padding: "2px 4px 12px" } },
      React.createElement("div", { style: { width: 26, height: 26, borderRadius: 7, background: "var(--text-primary)", display: "grid", placeItems: "center", flexShrink: 0 } },
        React.createElement(window.Icon.Layers, { size: 15, style: { color: "var(--bg-primary)" } })),
      React.createElement("span", { style: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" } }, "DevDigest")),
    React.createElement(RepoSwitcher),
    React.createElement("div", { style: { overflowY: "auto", flex: 1, margin: "4px -4px 0", padding: "0 4px" } },
      NAV.map((grp, gi) => React.createElement("div", { key: gi, style: { marginBottom: 14 } },
        React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", padding: "0 9px", marginBottom: 6 } }, grp.section),
        grp.items.map((it) => React.createElement(NavItem, { key: it.key, item: it, active }))))),
    // settings footer
    React.createElement("div", { style: { borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2 } },
      React.createElement(NavItem, { item: { key: "settings", label: "Settings", icon: "Settings" }, active })));
}

function Topbar({ title, crumb }) {
  return React.createElement("header", {
    style: {
      height: 52, flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--bg-primary)",
      display: "flex", alignItems: "center", gap: 14, padding: "0 18px",
    },
  },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 } },
      crumb && crumb.map((c, i) => React.createElement(React.Fragment, { key: i },
        i > 0 && React.createElement(window.Icon.ChevronRight, { size: 13, style: { color: "var(--text-muted)", flexShrink: 0 } }),
        React.createElement("span", { className: c.mono ? "mono" : undefined, style: { fontSize: 13, fontWeight: i === crumb.length - 1 ? 600 : 500, color: i === crumb.length - 1 ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace: "nowrap" } }, c.label)))),
    // command palette trigger
    React.createElement("div", {
      style: {
        marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, width: 260, padding: "6px 10px",
        borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-muted)", fontSize: 12.5,
      },
    },
      React.createElement(window.Icon.Search, { size: 14 }),
      React.createElement("span", { style: { flex: 1 } }, "Search or jump to…"),
      React.createElement(window.Kbd, null, "⌘K")),
    React.createElement(window.IconBtn, { icon: "RefreshCw", label: "Refresh" }),
    React.createElement(window.IconBtn, { icon: "Bell", label: "Notifications" }),
    React.createElement(window.Avatar, { name: "you", size: 26 }));
}

function AppFrame({ active, crumb, children, h = 900 }) {
  return React.createElement("div", {
    "data-screen-label": active,
    style: { display: "flex", width: "100%", minHeight: h, background: "var(--bg-primary)", alignItems: "stretch" },
  },
    React.createElement(Sidebar, { active }),
    React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } },
      React.createElement(Topbar, { crumb }),
      React.createElement("main", { style: { flex: 1, minHeight: 0 } }, children)));
}

Object.assign(window, { NAV, Sidebar, Topbar, AppFrame, NavItem });
