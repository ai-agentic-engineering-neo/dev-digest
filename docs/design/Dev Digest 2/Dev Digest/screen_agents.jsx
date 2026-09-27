/* screen_agents.jsx — N1 Agents list + N2 Agent Editor (Config/Skills/Evals/Stats/CI) */

function AgentsEmpty() {
  return React.createElement("div", { style: { flex: 1, display: "grid", placeItems: "center", padding: 40 } },
    React.createElement("div", { style: { textAlign: "center", maxWidth: 380 } },
      React.createElement("div", { style: { width: 64, height: 64, borderRadius: 16, margin: "0 auto 18px", background: "var(--bg-elevated)", border: "1px solid var(--border)", display: "grid", placeItems: "center", color: "var(--accent)" } },
        React.createElement(window.Icon.Cpu, { size: 30 })),
      React.createElement("h2", { style: { fontSize: 18, fontWeight: 700 } }, "No agents yet"),
      React.createElement("p", { style: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.55 } }, "An agent is a configured reviewer — a model, a prompt, and the skills it uses. Create one to start reviewing."),
      React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "center", marginTop: 18 } },
        React.createElement(window.Button, { kind: "primary", icon: "Plus" }, "Create your first agent"),
        React.createElement(window.Dropdown, { width: 200, trigger: React.createElement(window.Button, { kind: "secondary", iconRight: "ChevronDown" }, "Start from template"),
          items: window.AGENT_TEMPLATES.map((t) => ({ label: t, icon: "Cpu" })) }))));
}

/* ---- Editor tabs ---- */

function ConfigTab({ ag }) {
  return React.createElement("div", { style: { maxWidth: 760 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 18 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Configuration"),
      React.createElement("label", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" } }, "Enabled", React.createElement(window.Toggle, { on: ag.enabled, onChange: () => {}, size: 16 }))),
    React.createElement(window.FormField, { label: "Name", required: true }, React.createElement(window.TextInput, { value: ag.name })),
    React.createElement(window.FormField, { label: "Description" }, React.createElement(window.TextInput, { value: ag.description })),
    React.createElement(window.FormField, { label: "Model" }, React.createElement(window.SelectInput, { value: ag.model, options: ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "o1"] })),
    React.createElement(window.FormField, { label: "System prompt", hint: "Loaded as the static system message. Skills are appended below it.",
      right: React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, "412 / 8,000 tokens") },
      React.createElement("div", { style: { border: "1px solid var(--border-strong)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" } },
        React.createElement("pre", { className: "mono", style: { margin: 0, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-primary)", whiteSpace: "pre-wrap", minHeight: 200 } }, ag.systemPrompt))),
    React.createElement(window.FormField, { label: "Output schema" }, React.createElement(window.SelectInput, { value: "Standard findings JSON", options: [] })),
    React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
      React.createElement(window.Button, { kind: "primary", icon: "Check" }, "Save agent"),
      React.createElement(window.Button, { kind: "ghost" }, "Cancel")));
}

function SkillsTab({ ag }) {
  return React.createElement("div", { style: { maxWidth: 680 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Skills"),
      React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)" }, ag.skills.length + " of " + window.SKILLS.length + " enabled"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", width: 200, color: "var(--text-muted)", fontSize: 12 } },
        React.createElement(window.Icon.Search, { size: 13 }), "Filter skills…")),
    React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 } }, "Order matters — earlier skills appear earlier in the assembled prompt. Drag to reorder."),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
      window.SKILLS.map((s) => {
        const on = ag.skills.includes(s.id);
        const t = { rubric: "#3b82f6", convention: "#10b981", security: "#ef4444", custom: "#999999" }[s.type];
        return React.createElement("div", { key: s.id, style: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 7, border: "1px solid var(--border)", background: on ? "var(--bg-hover)" : "var(--bg-elevated)", opacity: on ? 1 : 0.7 } },
          React.createElement(window.Icon.Menu, { size: 14, style: { color: "var(--text-muted)", cursor: "grab" } }),
          React.createElement("span", { style: { width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + (on ? "var(--accent)" : "var(--border-strong)"), background: on ? "var(--accent)" : "transparent", display: "grid", placeItems: "center" } }, on && React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })),
          React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, flex: 1 } }, s.name),
          React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: t, background: t + "1a", padding: "1px 7px", borderRadius: 4 } }, s.type));
      })));
}

function ContextTab({ ag }) {
  return React.createElement(window.ProjectContextList, { key: ag.id, initialAttached: (window.AGENT_CONTEXT || {})[ag.id] || [] });
}

function StatBig({ label, value, suffix, sub, spark, color, arc }) {
  return React.createElement("div", { style: { flex: 1, padding: 15, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } }, label),
      arc != null && React.createElement(window.CircularScore, { score: arc, size: 32, stroke: 3.5 })),
    React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 } },
      React.createElement("span", { className: "tnum", style: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } }, value, suffix && React.createElement("span", { style: { fontSize: 15, color: "var(--text-muted)" } }, suffix)),
      sub && React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: sub.startsWith("-") ? "var(--crit)" : "var(--ok)" } }, sub)),
    spark && React.createElement("div", { style: { marginTop: 8 } }, React.createElement(window.Sparkline, { data: spark, color: color || "var(--accent)", w: 180, h: 26 })));
}

function StackedSeverityBar() {
  const weeks = [
    { c: 2, w: 5, s: 8 }, { c: 1, w: 7, s: 6 }, { c: 3, w: 4, s: 9 }, { c: 0, w: 6, s: 11 }, { c: 2, w: 8, s: 7 }, { c: 1, w: 5, s: 10 },
  ];
  const max = Math.max(...weeks.map((d) => d.c + d.w + d.s));
  return React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 12, height: 120, padding: "0 4px" } },
    weeks.map((d, i) => React.createElement("div", { key: i, style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2, height: "100%" } },
      ["s", "w", "c"].map((k) => { const col = { c: "var(--crit)", w: "var(--warn)", s: "var(--sugg)" }[k];
        return React.createElement("div", { key: k, style: { height: (d[k] / max * 100) + "%", background: col, borderRadius: 2 }, title: d[k] }); }),
      React.createElement("span", { style: { fontSize: 9.5, color: "var(--text-muted)", textAlign: "center", marginTop: 4 } }, "w" + (i + 1)))));
}

function StatsTab() {
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 20 } },
      React.createElement(StatBig, { label: "TOTAL RUNS (30D)", value: 142, spark: [120, 130, 118, 140, 135, 142, 150, 142], color: "var(--accent)" }),
      React.createElement(StatBig, { label: "AVG COST / RUN", value: "$0.04", sub: "-$0.01" }),
      React.createElement(StatBig, { label: "AVG DURATION", value: "6.2", suffix: "s" }),
      React.createElement(StatBig, { label: "ACCEPT RATE", value: "78", suffix: "%", arc: 78 })),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 } },
      React.createElement(window.Card, null, React.createElement(window.SectionLabel, { icon: "Sparkles" }, "Most-used skills"),
        [["secret-leakage-gate", 92], ["lethal-trifecta", 88], ["pr-quality-rubric", 71], ["no-then-chains", 34], ["test-coverage-nudge", 22]].map(([l, v], i) =>
          React.createElement(window.BarRow, { key: i, label: l, value: v, max: 100, color: "var(--accent)", suffix: v + "%" }))),
      React.createElement(window.Card, null, React.createElement(window.SectionLabel, { icon: "Database" }, "Most-pulled memory"),
        [["raw-body parser intentional", 64], ["bucketKey version prefix", 51], ["snake_case house style", 38], ["migrations ship alone", 29], ["vitest over jest", 18]].map(([l, v], i) =>
          React.createElement(window.BarRow, { key: i, label: l, value: v, max: 100, color: "#8b5cf6", suffix: v + "%" })))),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 } },
      React.createElement(window.Card, null, React.createElement(window.SectionLabel, { icon: "BarChart" }, "Findings by severity"),
        React.createElement(StackedSeverityBar),
        React.createElement("div", { style: { display: "flex", gap: 14, marginTop: 12, fontSize: 11 } },
          [["Critical", "var(--crit)"], ["Warning", "var(--warn)"], ["Suggestion", "var(--sugg)"]].map(([l, c]) =>
            React.createElement("span", { key: l, style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" } }, React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: c } }), l)))),
      React.createElement(window.Card, null, React.createElement(window.SectionLabel, { icon: "Tag" }, "Findings by category"),
        React.createElement("div", { style: { display: "grid", placeItems: "center", paddingTop: 6 } },
          React.createElement(window.Donut, { segments: [{ label: "security", value: 48, color: "var(--crit)" }, { label: "bug", value: 22, color: "var(--warn)" }, { label: "perf", value: 14, color: "#8b5cf6" }, { label: "style", value: 11, color: "var(--accent)" }, { label: "test", value: 5, color: "var(--ok)" }], size: 120 })))),
    React.createElement(window.SectionLabel, { icon: "History" }, "Run history"),
    React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" } },
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "150px 60px 70px 80px 70px 60px 90px", gap: 10, padding: "9px 14px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } },
        ["Timestamp", "PR", "Tokens", "Cost", "Findings", "Source", ""].map((c, i) => React.createElement("div", { key: i }, c))),
      [["2026-06-01 09:14", 482, "16k", "$0.06", 3, "local"], ["2026-06-01 08:42", 482, "15k", "$0.07", 3, "CI"], ["2026-05-31 18:30", 479, "22k", "$0.09", 5, "CI"], ["2026-05-30 11:02", 471, "18k", "$0.05", 0, "local"]].map((r, i) =>
        React.createElement("div", { key: i, style: { display: "grid", gridTemplateColumns: "150px 60px 70px 80px 70px 60px 90px", gap: 10, padding: "10px 14px", borderBottom: i < 3 ? "1px solid var(--border)" : "none", alignItems: "center", fontSize: 12 } },
          React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)", fontSize: 11 } }, r[0]),
          React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, "#" + r[1]),
          React.createElement("span", { className: "mono tnum" }, r[2]),
          React.createElement("span", { className: "mono tnum" }, r[3]),
          React.createElement("span", { className: "tnum" }, r[4]),
          React.createElement(window.Badge, { color: r[5] === "CI" ? "var(--warn)" : "var(--text-secondary)" }, r[5]),
          React.createElement(window.MonoLink, null, "View trace")))));
}

function CITab() {
  const [repos, setRepos] = React.useState([
    ["acme/payments-api", "GitHub Actions", "succeeded", "4m ago"],
    ["acme/billing-worker", "GitHub Actions", "succeeded", "1h ago"],
  ]);
  const [wizard, setWizard] = React.useState(false);
  const [failOn, setFailOn] = React.useState("critical");
  const exported = repos.length > 0;
  const FAIL_OPTS = [["critical", "Critical"], ["warning", "Warning +"], ["never", "Never"]];
  return React.createElement("div", { style: { maxWidth: 720 } },
    wizard && window.ExportWizard && React.createElement(window.ExportWizard, { onClose: () => setWizard(false) }),
    !exported
      ? React.createElement("div", { style: { maxWidth: 600, textAlign: "center", padding: "40px 0" } },
          React.createElement(window.EmptyState, { icon: "Workflow", title: "Not in CI yet", body: "Deploy this agent to run automatically on every pull request in a repo's CI pipeline.", cta: "Add to CI", onCta: () => setWizard(true) }))
      : React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
            React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "CI deployment"),
            React.createElement(window.Badge, { color: "var(--ok)", bg: "var(--ok-bg)", dot: true }, "Active in " + repos.length + " repos"),
            React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8 } },
              React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "RefreshCw" }, "Update CI config"),
              React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Plus", onClick: () => setWizard(true) }, "Add to CI"))),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 16 } },
            React.createElement("div", { style: { minWidth: 0, flex: 1 } },
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600 } }, "Fail CI on"),
              React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } }, "Exit non-zero when a finding at or above this severity lands. Pair with a required status check to block merges.")),
            React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, padding: 2, flexShrink: 0 } },
              FAIL_OPTS.map(([k, label]) => React.createElement("button", { key: k, onClick: () => setFailOn(k),
                style: { padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 5, border: "none", cursor: "pointer",
                  background: failOn === k ? "var(--bg-elevated)" : "transparent", color: failOn === k ? "var(--text-primary)" : "var(--text-muted)" } }, label)))),
          repos.map((r, i) =>
            React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 8 } },
              React.createElement(window.Icon.GitBranch, { size: 16, style: { color: "var(--text-muted)" } }),
              React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 600, flex: 1 } }, r[0]),
              React.createElement(window.Badge, { color: "var(--text-secondary)", icon: "Workflow" }, r[1]),
              React.createElement(window.Badge, { color: "var(--ok)", bg: "var(--ok-bg)", dot: true }, r[2]),
              React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, r[3]))),
          React.createElement("button", { onClick: () => setWizard(true),
            style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px dashed var(--border-strong)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 2 } },
            React.createElement(window.Icon.Plus, { size: 15 }), "Add repository")));
}

function EvalMetricStrip() {
  const E = window.EVAL;
  const items = [
    ["Recall", E.current.recall, E.delta.recall, "var(--accent)"],
    ["Precision", E.current.precision, E.delta.precision, "var(--ok)"],
    ["Citation accuracy", E.current.citation, E.delta.citation, "var(--warn)"],
    ["Traces passed", E.current.traces_passed / E.current.traces_total, null, "var(--text-secondary)"],
  ];
  return React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 18 } },
    items.map(([l, v, d, c], i) => React.createElement("div", { key: i, style: { flex: 1, padding: "11px 13px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 } }, l),
      React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 7 } },
        React.createElement("span", { className: "tnum", style: { fontSize: 22, fontWeight: 700, color: c } },
          l === "Traces passed" ? E.current.traces_passed + "/" + E.current.traces_total : Math.round(v * 100) + "%"),
        d != null && React.createElement("span", { className: "tnum", style: { fontSize: 11.5, fontWeight: 600, color: d >= 0 ? "var(--ok)" : "var(--crit)" } },
          (d >= 0 ? "▲ " : "▼ ") + Math.abs(Math.round(d * 100)) + "pt")))));
}

function EvalsTab({ onOpenCase, onOpenDashboard }) {
  const cases = window.EVAL_CASES;
  const pass = cases.filter((c) => c.status === "pass").length;
  const ran = cases.filter((c) => c.status !== "never").length;
  return React.createElement("div", { style: { maxWidth: 720 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } },
      React.createElement(window.SectionLabel, { icon: "Gauge" }, "Eval metrics"),
      React.createElement("div", { style: { marginLeft: "auto" } },
        React.createElement(window.MonoLink, { onClick: onOpenDashboard }, "View full dashboard →"))),
    React.createElement(EvalMetricStrip),
    React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 } },
      React.createElement(window.Icon.Code, { size: 12 }),
      "Scoring is mechanical — a finding counts when file matches and line ranges overlap. No model call in the scorer."),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Eval cases"),
      React.createElement(window.Badge, { color: pass === ran ? "var(--ok)" : "var(--warn)", bg: pass === ran ? "var(--ok-bg)" : "var(--warn-bg)" }, pass + " / " + ran + " passing"),
      React.createElement(window.Badge, { color: "var(--text-muted)" }, cases.length + " cases"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8 } },
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Play" }, "Run all evals"),
        React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Plus", onClick: onOpenCase }, "New eval case"))),
    window.EVAL_CASES.map((ec) => React.createElement(window.EvalCaseRow, { key: ec.id, ec, onClick: onOpenCase })));
}

function ScreenAgents({ tab = "Config", h = 860, onOpenCase, onOpenTrace, onOpenDashboard }) {
  const [sel, setSel] = React.useState("ag1");
  const [t, setT] = React.useState(tab);
  React.useEffect(() => setT(tab), [tab]);
  const ag = window.AGENTS.find((a) => a.id === sel);
  return React.createElement(window.AppFrame, { active: "agents", h, crumb: [{ label: "Skills Lab" }, { label: "Agents" }] },
    React.createElement("div", { style: { display: "flex", height: h - 52 } },
      // left list
      React.createElement("div", { style: { width: 280, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" } },
        React.createElement("div", { style: { padding: "14px 14px 10px" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } },
            React.createElement("h1", { style: { fontSize: 16, fontWeight: 700, flex: 1 } }, "Agents"),
            React.createElement(window.Dropdown, { width: 210, align: "right",
              trigger: React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Plus", iconRight: "ChevronDown" }, "Add Agent"),
              items: [{ label: "Create from scratch", icon: "Edit" }, { divider: true }, ...window.AGENT_TEMPLATES.map((tp) => ({ label: tp, icon: "Cpu", muted: true }))] })),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-muted)", fontSize: 12 } },
            React.createElement(window.Icon.Search, { size: 13 }), "Search agents…")),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "0 10px 10px" } },
          window.AGENTS.map((a) => React.createElement(window.AgentCard, { key: a.id, ag: a, active: sel === a.id, onClick: () => setSel(a.id) })))),
      // editor
      React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "14px 24px 0" } },
          React.createElement(window.Icon.Cpu, { size: 18, style: { color: "var(--accent)" } }),
          React.createElement("h1", { style: { fontSize: 17, fontWeight: 700 } }, ag.name),
          React.createElement("div", { style: { marginLeft: "auto" } }, React.createElement(window.RunReviewDropdown, { kind: "secondary" }))),
        React.createElement("div", { style: { marginTop: 12 } }, React.createElement(window.Tabs, { tabs: ["Config", "Skills", "Context", "Evals", "Stats", "CI"], value: t, onChange: setT })),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 24 } },
          t === "Config" && React.createElement(ConfigTab, { ag }),
          t === "Skills" && React.createElement(SkillsTab, { ag }),
          t === "Context" && React.createElement(ContextTab, { ag }),
          t === "Evals" && React.createElement(EvalsTab, { onOpenCase, onOpenDashboard }),
          t === "Stats" && React.createElement(StatsTab),
          t === "CI" && React.createElement(CITab)))));
}

Object.assign(window, { ScreenAgents, AgentsEmpty });
