/* screen_settings.jsx — N9 Settings (focus: Automatic Reviews + Integrations) */

const SETTINGS_NAV = ["API Keys", "GitHub Integration", "Workspace", "Automatic Reviews", "Integrations", "About"];

function SettingsAutoReviews() {
  return React.createElement("div", { style: { maxWidth: 640 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "Automatic Reviews"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "Poll GitHub for new PRs and run agents without manual triggering."),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 18 } },
      React.createElement(window.Toggle, { on: true, onChange: () => {}, size: 18 }),
      React.createElement("div", null, React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600 } }, "Auto-run review on new PR detection"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)" } }, "Currently active across this workspace"))),
    React.createElement(window.FormField, { label: "Polling interval" }, React.createElement(window.SelectInput, { value: "Every 5 minutes" })),
    React.createElement(window.FormField, { label: "Agents to run" },
      React.createElement("div", { style: { display: "flex", gap: 7, flexWrap: "wrap" } },
        React.createElement(window.Chip, { active: true, icon: "Check" }, "Security Reviewer"),
        React.createElement(window.Chip, { active: true, icon: "Check" }, "Performance Reviewer"),
        React.createElement(window.Chip, { icon: "Plus" }, "Custom Mentor"))),
    React.createElement(window.FormField, { label: "Trigger conditions" },
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        [["On new PR", true], ["On new commits to existing PR", true]].map(([l, on], i) =>
          React.createElement("label", { key: i, style: { display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--text-secondary)" } },
            React.createElement("span", { style: { width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + (on ? "var(--accent)" : "var(--border-strong)"), background: on ? "var(--accent)" : "transparent", display: "grid", placeItems: "center" } }, on && React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })), l)))),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 8, background: "var(--ok-bg)", border: "1px solid rgba(16,185,129,0.25)", marginBottom: 18, fontSize: 12.5, color: "var(--text-secondary)" } },
      React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: "var(--ok)", animation: "ddpulse 2s infinite" } }),
      React.createElement("span", null, React.createElement("b", { style: { color: "var(--text-primary)" } }, "Active"), " · last poll 2m ago · 7 PRs tracked")),
    React.createElement("div", { style: { display: "flex", gap: 9, padding: "11px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } },
      React.createElement(window.Icon.Info, { size: 15, style: { flexShrink: 0, marginTop: 1 } }),
      React.createElement("span", null, "Polling is the default. For instant triggers and CI execution, install the GitHub Action under ", React.createElement("b", { style: { color: "var(--text-secondary)" } }, "Integrations"), ".")));
}

function IntegrationCard({ icon, title, status, statusColor, desc, children }) {
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", padding: 18, marginBottom: 14 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 11, marginBottom: 10 } },
      React.createElement("div", { style: { width: 34, height: 34, borderRadius: 8, background: "var(--bg-surface)", display: "grid", placeItems: "center", color: "var(--text-secondary)" } }, React.createElement(window.Icon[icon], { size: 18 })),
      React.createElement("div", { style: { flex: 1 } }, React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, title),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } }, desc)),
      status && React.createElement(window.Badge, { color: statusColor, bg: "transparent", dot: true }, status)),
    children);
}

function SettingsIntegrations() {
  return React.createElement("div", { style: { maxWidth: 660 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "Integrations"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "Connect CI and share your configuration as portable plugins."),
    React.createElement(IntegrationCard, { icon: "Workflow", title: "GitHub Action", status: "2 repos", statusColor: "var(--ok)", desc: "Run agents inside CI on every PR" },
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Plus" }, "Install in a repo")),
      [["acme/payments-api", "succeeded 4m ago"], ["acme/billing-worker", "succeeded 1h ago"]].map((r, i) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 6, background: "var(--bg-surface)", marginTop: 6, fontSize: 12.5 } },
          React.createElement(window.Icon.GitBranch, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement("span", { className: "mono", style: { flex: 1, fontWeight: 600 } }, r[0]),
          React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, r[1]),
          React.createElement(window.MonoLink, null, "Manage")))),
    React.createElement(IntegrationCard, { icon: "Upload", title: "Plugin Export", desc: "Skills, agents, learnings, and eval cases as a portable package" },
      React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Boxes" }, "Export workspace as plugin"),
      React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 } }, "Last export: ", React.createElement("span", { className: "mono" }, "devdigest-acme-2026-05-28.zip"), " · 6 skills · 3 agents")),
    React.createElement(IntegrationCard, { icon: "Boxes", title: "Plugin Import", desc: "Install a shared workspace configuration" },
      React.createElement("div", { style: { border: "1.5px dashed var(--border-strong)", borderRadius: 9, padding: "20px", textAlign: "center", marginBottom: 12 } },
        React.createElement(window.Icon.Upload, { size: 22, style: { color: "var(--text-muted)" } }),
        React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 8 } }, "Drop a ", React.createElement("span", { className: "mono" }, ".zip"), " plugin here, or ", React.createElement("span", { style: { color: "var(--accent-text)" } }, "browse files…"))),
      [["owasp-skill-pack", true], ["frontend-guild-skills", false]].map((r, i) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 6, background: "var(--bg-surface)", marginTop: 6, fontSize: 12.5 } },
          React.createElement(window.Icon.Boxes, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement("span", { className: "mono", style: { flex: 1, fontWeight: 600 } }, r[0]),
          React.createElement(window.Badge, { color: r[1] ? "var(--ok)" : "var(--text-muted)", dot: true }, r[1] ? "enabled" : "disabled"),
          React.createElement(window.MonoLink, null, r[1] ? "Disable" : "Remove")))));
}

function ScreenSettings({ section = "Automatic Reviews", h = 760 }) {
  const [sec, setSec] = React.useState(section);
  return React.createElement(window.AppFrame, { active: "settings", h, crumb: [{ label: "Settings" }, { label: sec }] },
    React.createElement("div", { style: { display: "flex", height: h - 52 } },
      React.createElement("div", { style: { width: 210, flexShrink: 0, borderRight: "1px solid var(--border)", padding: 14, background: "var(--bg-surface)" } },
        React.createElement("h1", { style: { fontSize: 15, fontWeight: 700, padding: "2px 8px 12px" } }, "Settings"),
        SETTINGS_NAV.map((s) => {
          const on = sec === s;
          return React.createElement("div", { key: s, onClick: () => setSec(s), style: { padding: "7px 10px", borderRadius: 6, fontSize: 13, fontWeight: on ? 600 : 500, cursor: "pointer", color: on ? "var(--text-primary)" : "var(--text-secondary)", background: on ? "var(--bg-hover)" : "transparent", marginBottom: 2 } }, s);
        })),
      React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "24px 28px" } },
        sec === "Automatic Reviews" ? React.createElement(SettingsAutoReviews)
        : sec === "Integrations" ? React.createElement(SettingsIntegrations)
        : React.createElement(window.EmptyState, { icon: "Settings", title: sec, body: "Standard configuration forms for " + sec + " live here." }))));
}

Object.assign(window, { ScreenSettings });
