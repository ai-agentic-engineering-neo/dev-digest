/* screen_cizruns.jsx — N13 CI Runs + N3 Eval Case Editor */

const CI_STATUS = {
  succeeded: { c: "var(--ok)", bg: "var(--ok-bg)", label: "Succeeded" },
  no_findings: { c: "var(--text-secondary)", bg: "var(--bg-hover)", label: "No findings" },
  failed: { c: "var(--crit)", bg: "var(--crit-bg)", label: "Failed" },
};

function CIFindingsCell({ f }) {
  const items = [["CRITICAL", f.CRITICAL], ["WARNING", f.WARNING], ["SUGGESTION", f.SUGGESTION]].filter(([, n]) => n > 0);
  if (!items.length) return React.createElement("span", { style: { fontSize: 12, color: "var(--text-muted)" } }, "—");
  return React.createElement("div", { style: { display: "flex", gap: 7 } }, items.map(([sv, n]) => {
    const s = window.SEV[sv];
    return React.createElement("span", { key: sv, style: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600, color: s.c } }, React.createElement(window.Icon[s.icon], { size: 12 }), React.createElement("span", { className: "tnum" }, n));
  }));
}

function ScreenCIRuns({ h = 760, empty }) {
  if (empty) return React.createElement(window.AppFrame, { active: "ci-runs", h, crumb: [{ label: "CI Runs" }] },
    React.createElement(window.EmptyState, { icon: "Workflow", title: "No CI runs yet", body: "Once you export an agent to CI, every automated review shows up here.", cta: "Set up CI for an agent" }));
  return React.createElement(window.AppFrame, { active: "ci-runs", h, crumb: [{ label: "CI Runs" }] },
    React.createElement("div", { style: { padding: "20px 28px 6px", display: "flex", alignItems: "flex-end", gap: 12 } },
      React.createElement("div", null,
        React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "CI Runs"),
        React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Agent reviews executed inside CI · not local runs")),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 5 } }, React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: "var(--ok)" } }), "auto-refresh on"),
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "RefreshCw" }, "Refresh"))),
    React.createElement("div", { style: { display: "flex", gap: 8, padding: "12px 28px", flexWrap: "wrap" } },
      React.createElement(window.Chip, { icon: "Calendar" }, "Last 7 days"),
      React.createElement(window.Chip, { icon: "Cpu" }, "All agents"),
      React.createElement(window.Chip, { icon: "GitBranch" }, "All repos"),
      React.createElement(window.Chip, { active: true }, "All statuses"),
      React.createElement(window.Chip, { icon: "Workflow" }, "All sources")),
    React.createElement("div", { style: { margin: "6px 28px 40px", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg-elevated)" } },
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "140px 1fr 150px 130px 70px 110px 70px 110px 80px", gap: 12, padding: "10px 16px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } },
        ["Timestamp", "Pull request", "Agent", "Source", "Dur.", "Findings", "Cost", "Status", ""].map((c, i) => React.createElement("div", { key: i }, c))),
      window.CI_RUNS.map((r, i) => {
        const st = CI_STATUS[r.status];
        return React.createElement("div", { key: r.id, style: { display: "grid", gridTemplateColumns: "140px 1fr 150px 130px 70px 110px 70px 110px 80px", gap: 12, padding: "12px 16px", borderBottom: i < window.CI_RUNS.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", fontSize: 12.5 } },
          React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-secondary)" } }, r.ts),
          React.createElement("div", { style: { minWidth: 0 } },
            React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--accent-text)" } }, "#" + r.pr), " ",
            React.createElement("span", { style: { fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", verticalAlign: "bottom", maxWidth: "85%" } }, r.prTitle)),
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" } }, React.createElement(window.Icon.Cpu, { size: 13, style: { color: "var(--text-muted)" } }), r.agent),
          React.createElement(window.Badge, { color: "var(--text-secondary)", icon: "Workflow" }, r.source),
          React.createElement("span", { className: "tnum", style: { fontSize: 12 } }, r.duration ? r.duration + "s" : "—"),
          React.createElement(CIFindingsCell, { f: r.findings }),
          React.createElement("span", { className: "mono tnum", style: { fontSize: 12, color: "var(--text-secondary)" } }, r.cost ? "$" + r.cost.toFixed(2) : "—"),
          React.createElement(window.Badge, { color: st.c, bg: st.bg, dot: true }, st.label),
          React.createElement(window.MonoLink, null, "Trace"));
      })));
}

/* ---- N3 Eval Case Editor (modal) ---- */
function EvalCaseEditor({ onClose, seed }) {
  const [tab, setTab] = React.useState("Diff");
  const negative = seed && seed.direction === "negative";
  const DIFF_TEXT = `--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,6 +10,7 @@\n export const config = {\n   port: Number(process.env.PORT ?? 3000),\n+  stripeKey: "sk_live_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc",\n   redisUrl: process.env.REDIS_URL,\n };`;
  const EXPECTED = seed ? seed.expected : `[\n  {\n    "severity": "CRITICAL",\n    "category": "security",\n    "title": "Hardcoded Stripe secret key",\n    "file": "src/config.ts",\n    "start_line": 12\n  }\n]`;
  const caseName = seed ? seed.name : "stripe-key-leak";
  return React.createElement(window.Modal, { width: 920, title: "Eval case · " + caseName, subtitle: seed ? "Seeded from a " + (negative ? "dismissed" : "accepted") + " finding · assert the expected output" : "Security Reviewer · simulate a PR and assert the expected output", onClose,
    footer: React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-secondary)", marginRight: "auto" } }, React.createElement(window.Toggle, { on: true, onChange: () => {}, size: 15 }), "Run on save"),
      React.createElement(window.Button, { kind: "ghost", onClick: onClose }, "Cancel"),
      React.createElement(window.Button, { kind: "secondary", icon: "Play" }, "Run case"),
      React.createElement(window.Button, { kind: "primary", icon: "Check" }, "Save")) },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, height: 480 } },
      // left: inputs
      React.createElement("div", { style: { borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minWidth: 0 } },
        seed && React.createElement("div", { style: { margin: "12px 16px 0", padding: "9px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 9,
          border: "1px solid " + (negative ? "var(--border-strong)" : "var(--accent)"), background: negative ? "var(--bg-elevated)" : "var(--accent-bg)" } },
          React.createElement(window.Icon[negative ? "XCircle" : "Target"], { size: 15, style: { color: negative ? "var(--text-muted)" : "var(--accent)", flexShrink: 0 } }),
          React.createElement("span", { style: { fontSize: 12, color: "var(--text-secondary)" } },
            React.createElement("b", { style: { color: negative ? "var(--text-primary)" : "var(--accent-text)", textTransform: "uppercase", fontSize: 10.5, letterSpacing: "0.05em", marginRight: 7 } }, negative ? "Negative case" : "Positive case"),
            seed.assertion)),
        React.createElement("div", { style: { padding: "14px 16px 0" } },
          React.createElement(window.FormField, { label: "Name", required: true }, React.createElement(window.TextInput, { value: caseName, mono: true }))),
        React.createElement("div", { style: { padding: "0 16px" } }, React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 } }, "Input")),
        React.createElement(window.Tabs, { tabs: ["Diff", "Files", "PR meta"], value: tab, onChange: setTab, pad: "0 16px" }),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "12px 16px" } },
          tab === "Diff" && React.createElement("pre", { className: "mono", style: { margin: 0, fontSize: 11.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--text-primary)" } },
            DIFF_TEXT.split("\n").map((l, i) => React.createElement("div", { key: i, style: { background: l.startsWith("+") && !l.startsWith("+++") ? "var(--code-add)" : l.startsWith("-") && !l.startsWith("---") ? "var(--code-del)" : "transparent", color: l.startsWith("@@") ? "var(--accent-text)" : "inherit" } }, l || " "))),
          tab === "Files" && React.createElement("div", { style: { display: "flex", gap: 10 } },
            React.createElement("div", { style: { width: 130, borderRight: "1px solid var(--border)", paddingRight: 10 } },
              React.createElement("div", { className: "mono", style: { fontSize: 11.5, color: "var(--accent-text)", padding: "4px 6px", background: "var(--accent-bg)", borderRadius: 5 } }, "config.ts"),
              React.createElement("div", { className: "mono", style: { fontSize: 11.5, color: "var(--text-secondary)", padding: "4px 6px" } }, "server.ts")),
            React.createElement("pre", { className: "mono", style: { margin: 0, fontSize: 11.5, color: "var(--text-secondary)", flex: 1 } }, "export const config = {\n  port: 3000,\n  ...\n};")),
          tab === "PR meta" && React.createElement("div", null,
            React.createElement(window.FormField, { label: "Title" }, React.createElement(window.TextInput, { value: "Add Stripe integration" })),
            React.createElement(window.FormField, { label: "Body" }, React.createElement(window.TextInput, { value: "Wire up payments via Stripe SDK." })),
            React.createElement(window.FormField, { label: "Linked issue" }, React.createElement(window.TextInput, { value: "#311", mono: true }))))),
      // right: expected + result
      React.createElement("div", { style: { display: "flex", flexDirection: "column", minWidth: 0 } },
        React.createElement("div", { style: { padding: "14px 16px 8px", display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" } }, negative ? "Expected: no finding here" : "Expected output"),
          React.createElement(window.Badge, { color: "var(--ok)", bg: "var(--ok-bg)", icon: "Check" }, negative ? "assert empty" : "valid JSON"),
          React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 6 } },
            React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Plus" }, "Finding skeleton"))),
        React.createElement("pre", { className: "mono", style: { margin: "0 16px", padding: 12, fontSize: 11.5, lineHeight: 1.55, background: "var(--code-bg)", borderRadius: 7, color: "var(--text-primary)", overflow: "auto", flex: 1 } }, EXPECTED),
        React.createElement("div", { style: { margin: "12px 16px 16px", padding: "11px 13px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.3)", background: "var(--ok-bg)", display: "flex", alignItems: "center", gap: 9 } },
          React.createElement(window.Icon.CheckCircle, { size: 16, style: { color: "var(--ok)" } }),
          React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-secondary)" } }, React.createElement("b", { style: { color: "var(--text-primary)" } }, "Last run passed"), " · expected 1 finding, got 1 · 1.8s · $0.02")))));
}

function ScreenEvalCase({ h = 720, seed }) {
  return React.createElement("div", { style: { position: "relative", width: "100%", height: h, overflow: "hidden", background: "var(--bg-primary)" } },
    React.createElement("div", { style: { filter: "saturate(0.7)", pointerEvents: "none", height: "100%", overflow: "hidden" } }, React.createElement(window.ScreenAgents, { tab: "Evals", h })),
    React.createElement(EvalCaseEditor, { seed, onClose: () => {} }));
}

Object.assign(window, { ScreenCIRuns, ScreenEvalCase, EvalCaseEditor });
