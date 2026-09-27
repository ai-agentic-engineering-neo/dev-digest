/* screen_multiagent.jsx — N4 Multi-Agent Review (dynamic columns + tabs) */

function AgentFindingMini({ f }) {
  const s = window.SEV[f.severity];
  return React.createElement("div", { style: { padding: "8px 10px", borderRadius: 6, background: "var(--bg-surface)", borderLeft: "2px solid " + s.c } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
      React.createElement(window.Icon[s.icon], { size: 12, style: { color: s.c, flexShrink: 0 } }),
      React.createElement("span", { style: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 } }, f.title)),
    React.createElement("div", { className: "mono", style: { fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 } }, f.file + ":" + f.start_line));
}

function AgentColHeader({ p }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9 } },
    React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: p.color + "1f", color: p.color, flexShrink: 0 } }, React.createElement(window.Icon[p.icon], { size: 16 })),
    React.createElement("div", { style: { minWidth: 0, flex: 1 } },
      React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, p.name),
      React.createElement("div", { className: "mono tnum", style: { fontSize: 10.5, color: "var(--text-muted)" } }, (p.duration_ms / 1000).toFixed(1) + "s · $" + p.cost.toFixed(2))),
    React.createElement(window.CircularScore, { score: p.score, size: 32, stroke: 3.5 }));
}

function ConflictsSection() {
  return React.createElement("div", { style: { marginTop: 22 } },
    React.createElement(window.SectionLabel, { icon: "Activity", right: React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-secondary)" } }, "Show only conflicts", React.createElement(window.Toggle, { on: false, onChange: () => {}, size: 15 })) }, "Where agents disagree"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
      window.PERSONA_CONFLICTS.map((c, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" } },
          React.createElement(window.Icon.Code, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement("span", { className: "mono", style: { fontSize: 12 } }, c.file + ":" + c.line),
          React.createElement("span", { style: { fontSize: 13, fontWeight: 600, marginLeft: 6 } }, c.title)),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(" + c.takes.length + ", 1fr)", gap: 1, background: "var(--border)" } },
          c.takes.map((t, ti) => {
            const flagged = t.verdict !== "ignored";
            return React.createElement("div", { key: ti, style: { padding: "10px 14px", background: "var(--bg-elevated)" } },
              React.createElement("div", { style: { fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 } }, t.persona),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 } },
                React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: flagged ? (window.SEV[t.verdict] ? window.SEV[t.verdict].c : "var(--warn)") : "var(--text-muted)" } }),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: flagged ? "var(--text-primary)" : "var(--text-muted)", textTransform: flagged ? "uppercase" : "none", letterSpacing: flagged ? "0.03em" : 0 } }, flagged ? t.verdict : "did not flag")),
              React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 } }, t.note));
          }))))));
}

function MetaRow({ agents, pr }) {
  const totalCost = agents.reduce((a, p) => a + p.cost, 0);
  const totalTime = agents.reduce((a, p) => Math.max(a, p.duration_ms), 0) / 1000;
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "14px 28px", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-secondary)" } },
    React.createElement("span", { className: "mono", style: { color: "var(--text-muted)" } }, "#" + (pr ? pr.number : 482)),
    React.createElement("span", { style: { fontWeight: 600, color: "var(--text-primary)" } }, pr ? pr.title : "Add rate limiting to public API endpoints"),
    React.createElement("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 } },
      React.createElement(window.Icon.Cpu, { size: 14, style: { color: "var(--accent)" } }), agents.length + " agents · fan-out via worktrees · " + totalTime.toFixed(1) + "s total · $" + totalCost.toFixed(2)));
}

function ColumnsView({ agents }) {
  const n = agents.length;
  const cols = n <= 2 ? n : n <= 5 ? n : 5;
  return React.createElement("div", { style: { padding: "20px 28px 40px" } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(" + cols + ", minmax(220px, 1fr))", gap: 12, overflowX: n > 5 ? "auto" : "visible" } },
      agents.map((p, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-elevated)", display: "flex", flexDirection: "column", overflow: "hidden" } },
        React.createElement("div", { style: { padding: 12, borderBottom: "1px solid var(--border)", borderTop: "2px solid " + p.color } }, React.createElement(AgentColHeader, { p })),
        React.createElement("div", { style: { padding: 12, display: "flex", flexDirection: "column", gap: 7, flex: 1 } },
          p.findings.map((f, fi) => React.createElement(AgentFindingMini, { key: fi, f }))),
        React.createElement("div", { style: { padding: "9px 12px", borderTop: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between" } },
          React.createElement(window.MonoLink, null, "View trace"),
          React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, p.findings.length + " findings"))))),
    React.createElement(ConflictsSection));
}

function TabsView({ agents }) {
  const [sel, setSel] = React.useState(0);
  const p = agents[sel];
  return React.createElement("div", { style: { padding: "0 0 40px" } },
    React.createElement("div", { style: { display: "flex", gap: 2, padding: "0 28px", borderBottom: "1px solid var(--border)", overflowX: "auto" } },
      agents.map((pp, i) => {
        const on = sel === i;
        return React.createElement("button", { key: i, onClick: () => setSel(i), style: { display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "none", background: "transparent", borderBottom: "2px solid " + (on ? pp.color : "transparent"), marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap" } },
          React.createElement(window.Icon[pp.icon], { size: 15, style: { color: on ? pp.color : "var(--text-muted)" } }),
          React.createElement("span", { style: { fontSize: 13, fontWeight: on ? 600 : 500, color: on ? "var(--text-primary)" : "var(--text-secondary)" } }, pp.name),
          React.createElement("span", { className: "tnum", style: { fontSize: 11, fontWeight: 700, color: pp.score >= 70 ? "var(--ok)" : pp.score >= 50 ? "var(--warn)" : "var(--crit)" } }, pp.score));
      })),
    React.createElement("div", { style: { padding: "20px 28px", maxWidth: 760 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 18, borderLeft: "3px solid " + p.color } },
        React.createElement(window.CircularScore, { score: p.score, size: 44 }),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: p.color } }, p.name),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } }, p.summary)),
        React.createElement("div", { style: { marginLeft: "auto", textAlign: "right", display: "flex", flexDirection: "column", gap: 4 } },
          React.createElement(window.MonoLink, null, "View trace"),
          React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-muted)" } }, (p.duration_ms / 1000).toFixed(1) + "s · $" + p.cost.toFixed(2)))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        p.findings.map((f, fi) => React.createElement(window.FindingCard, { key: fi, f, idx: fi })))),
    React.createElement("div", { style: { padding: "0 28px" } }, React.createElement(ConflictsSection)));
}

function PersonaPickCard({ p, on, onToggle }) {
  return React.createElement("button", { onClick: onToggle,
    style: { display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 9, cursor: "pointer", textAlign: "left", width: "100%",
      border: "1px solid " + (on ? p.color : "var(--border)"), background: on ? p.color + "12" : "var(--bg-elevated)", transition: "border-color .12s, background .12s" } },
    React.createElement("span", { style: { width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, display: "grid", placeItems: "center",
      border: "1.5px solid " + (on ? p.color : "var(--border-strong)"), background: on ? p.color : "transparent" } },
      on && React.createElement(window.Icon.Check, { size: 12, style: { color: "#fff" } })),
    React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: p.color + "1f", color: p.color, flexShrink: 0 } }, React.createElement(window.Icon[p.icon], { size: 16 })),
    React.createElement("div", { style: { minWidth: 0, flex: 1 } },
      React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600 } }, p.name),
      React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 } }, p.summary)),
    React.createElement("span", { className: "mono", style: { fontSize: 10.5, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 } }, (p.duration_ms / 1000).toFixed(1) + "s · $" + p.cost.toFixed(2)));
}

function RunConfig({ pr, setPrNum, sel, toggle, setAll, onRun }) {
  const personas = window.PERSONAS;
  const prItems = window.PR_LIST.filter((p) => p.status !== "stale").map((p) => ({
    label: "#" + p.number + " · " + p.title, icon: "GitPullRequest", onClick: () => setPrNum(p.number),
  }));
  const chosen = personas.filter((p) => sel.includes(p.name));
  const estCost = chosen.reduce((a, p) => a + p.cost, 0);
  const estTime = chosen.reduce((a, p) => Math.max(a, p.duration_ms), 0) / 1000;
  const allOn = sel.length === personas.length;
  return React.createElement("div", { style: { padding: "24px 28px 40px", maxWidth: 720, margin: "0 auto" } },
    React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Run a Multi-Agent Review"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 22 } }, "Pick a pull request and choose which agents to fan out — they run in parallel and you compare their findings side by side."),
    // step 1 — PR
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
      React.createElement("span", { style: { width: 22, height: 22, borderRadius: 99, background: "var(--accent-bg)", color: "var(--accent-text)", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center" } }, "1"),
      React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600 } }, "Pull request")),
    React.createElement("div", { style: { marginLeft: 32, marginBottom: 24 } },
      React.createElement(window.Dropdown, { width: 420, align: "left",
        trigger: React.createElement(window.Button, { kind: "secondary", icon: "GitPullRequest", iconRight: "ChevronDown" },
          pr ? "#" + pr.number + " · " + pr.title : "Select a pull request…"),
        items: prItems })),
    // step 2 — agents (or empty state gated on PR)
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
      React.createElement("span", { style: { width: 22, height: 22, borderRadius: 99, background: pr ? "var(--accent-bg)" : "var(--bg-hover)", color: pr ? "var(--accent-text)" : "var(--text-muted)", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center" } }, "2"),
      React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600, color: pr ? "var(--text-primary)" : "var(--text-muted)" } }, "Agents to run"),
      pr && React.createElement("button", { onClick: () => setAll(!allOn),
        style: { marginLeft: "auto", border: "none", background: "transparent", color: "var(--accent-text)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } }, allOn ? "Clear all" : "Select all")),
    pr
      ? React.createElement("div", { style: { marginLeft: 32, display: "flex", flexDirection: "column", gap: 8 } },
          personas.map((p) => React.createElement(PersonaPickCard, { key: p.name, p, on: sel.includes(p.name), onToggle: () => toggle(p.name) })))
      : React.createElement("div", { style: { marginLeft: 32, padding: "34px 20px", borderRadius: 10, border: "1px dashed var(--border-strong)", background: "var(--bg-elevated)", textAlign: "center" } },
          React.createElement("div", { style: { width: 42, height: 42, borderRadius: 11, background: "var(--bg-hover)", display: "grid", placeItems: "center", margin: "0 auto 12px" } },
            React.createElement(window.Icon.GitPullRequest, { size: 21, style: { color: "var(--text-muted)" } })),
          React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, "Pick a pull request first"),
          React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, maxWidth: 320, marginInline: "auto", lineHeight: 1.5 } }, "Choose which PR to review above, then select the agents to run on it.")),
    // run bar
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, marginTop: 26, marginLeft: 32 } },
      React.createElement(window.Button, { kind: "primary", icon: "Users", disabled: !pr || sel.length === 0, onClick: onRun },
        sel.length > 1 ? "Run multi-agent review (" + sel.length + ")" : sel.length === 1 ? "Run 1 agent" : "Select agents"),
      pr && sel.length > 0 && React.createElement("span", { className: "mono", style: { fontSize: 11.5, color: "var(--text-muted)" } },
        "≈ " + estTime.toFixed(1) + "s · $" + estCost.toFixed(2) + " · parallel fan-out")));
}

function ScreenMultiAgent({ view = "columns", agentCount = 4, h = 1000, phase: phase0, prNum: prNum0 }) {
  const [phase, setPhase] = React.useState(phase0 || "results");
  const [prNum, setPrNum] = React.useState(prNum0 === undefined ? 482 : prNum0);
  const [sel, setSel] = React.useState(window.PERSONAS.slice(0, agentCount).map((p) => p.name));
  const [v, setV] = React.useState(view);
  React.useEffect(() => setV(view), [view]);
  const pr = window.PR_LIST.find((p) => p.number === prNum) || null;
  const selected = window.PERSONAS.filter((p) => sel.includes(p.name));
  const toggle = (name) => setSel((s) => s.includes(name) ? s.filter((x) => x !== name) : [...s, name]);

  if (phase === "config") return React.createElement(window.AppFrame, { active: "personas", h, crumb: [{ label: "Multi-Agent Review" }, { label: "Configure run" }] },
    React.createElement(RunConfig, { pr, setPrNum, sel, toggle, setAll: (on) => setSel(on ? window.PERSONAS.map((p) => p.name) : []), onRun: () => setPhase("results") }));

  if (selected.length === 0) return React.createElement(window.AppFrame, { active: "personas", h, crumb: [{ label: "Multi-Agent Review" }] },
    React.createElement(window.EmptyState, { icon: "Cpu", title: "No agents selected", body: "Pick at least one agent to fan out this review. Configure the run to choose agents.", cta: "Configure run" }));

  return React.createElement(window.AppFrame, { active: "personas", h, crumb: [{ label: "Multi-Agent Review" }, { label: "#" + (pr ? pr.number : 482), mono: true }] },
    React.createElement("div", { style: { padding: "18px 28px 4px", display: "flex", alignItems: "center", gap: 12 } },
      React.createElement("button", { onClick: () => setPhase("config"), title: "Change PR or agents",
        style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" } },
        React.createElement(window.Icon.Settings, { size: 14 }), "Configure run"),
      React.createElement("h1", { style: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } }, "Multi-Agent Review"),
      React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-muted)" } }, selected.length + " selected agents · parallel"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 } },
        ["columns", "tabs"].map((k) => React.createElement("button", { key: k, onClick: () => setV(k),
          style: { padding: "4px 12px", fontSize: 11.5, fontWeight: 600, borderRadius: 5, border: "none", textTransform: "capitalize",
            background: v === k ? "var(--bg-elevated)" : "transparent", color: v === k ? "var(--text-primary)" : "var(--text-muted)" } }, k)))),
    React.createElement(MetaRow, { agents: selected, pr }),
    v === "columns" ? React.createElement(ColumnsView, { agents: selected }) : React.createElement(TabsView, { agents: selected }));
}

Object.assign(window, { ScreenMultiAgent });
