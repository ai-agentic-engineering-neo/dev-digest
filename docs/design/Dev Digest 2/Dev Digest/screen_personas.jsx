/* screen_personas.jsx — Persona Comparison: columns + tabs variants */

function PersonaFindingMini({ f }) {
  const s = window.SEV[f.severity];
  return React.createElement("div", { style: { padding: "8px 10px", borderRadius: 6, background: "var(--bg-surface)", borderLeft: "2px solid " + s.c } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
      React.createElement(window.Icon[s.icon], { size: 12, style: { color: s.c, flexShrink: 0 } }),
      React.createElement("span", { style: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 } }, f.title)),
    React.createElement("div", { className: "mono", style: { fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 } }, f.file + ":" + f.start_line));
}

function PersonaHeader({ p, compact }) {
  const I = window.Icon[p.icon];
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
    React.createElement("div", { style: { width: compact ? 30 : 34, height: compact ? 30 : 34, borderRadius: 8, display: "grid", placeItems: "center", background: p.color + "1f", color: p.color, flexShrink: 0 } }, React.createElement(I, { size: compact ? 16 : 18 })),
    React.createElement("div", { style: { minWidth: 0 } },
      React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" } }, p.name),
      React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 } },
        React.createElement("span", { className: "tnum" }, (p.duration_ms / 1000).toFixed(1) + "s"),
        React.createElement("span", { className: "mono tnum" }, "$" + p.cost.toFixed(2)))),
    React.createElement("div", { style: { marginLeft: "auto" } }, React.createElement(window.CircularScore, { score: p.score, size: 34, stroke: 3.5 })));
}

function ConflictsSection() {
  return React.createElement("div", { style: { marginTop: 22 } },
    React.createElement(window.SectionLabel, { icon: "Activity", right: React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-secondary)" } }, "Show only conflicts", React.createElement(window.Toggle, { on: false, onChange: () => {}, size: 15 })) }, "Where personas disagree"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
      window.PERSONA_CONFLICTS.map((c, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" } },
          React.createElement(window.Icon.Code, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement("span", { className: "mono", style: { fontSize: 12 } }, c.file + ":" + c.line),
          React.createElement("span", { style: { fontSize: 13, fontWeight: 600, marginLeft: 6 } }, c.title)),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--border)" } },
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

function PersonaMetaRow() {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "14px 28px", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-secondary)" } },
    React.createElement("span", { className: "mono", style: { color: "var(--text-muted)" } }, "#482"),
    React.createElement("span", { style: { fontWeight: 600, color: "var(--text-primary)" } }, "Add rate limiting to public API endpoints"),
    React.createElement("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 } },
      React.createElement(window.Icon.Users, { size: 14, style: { color: "var(--accent)" } }), "5 personas · fan-out via worktrees · 4.0s total"));
}

function ColumnsView() {
  return React.createElement("div", { style: { padding: "20px 28px 40px" } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 } },
      window.PERSONAS.map((p, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-elevated)", display: "flex", flexDirection: "column", overflow: "hidden" } },
        React.createElement("div", { style: { padding: 12, borderBottom: "1px solid var(--border)", borderTop: "2px solid " + p.color } }, React.createElement(PersonaHeader, { p })),
        React.createElement("div", { style: { padding: 12, display: "flex", flexDirection: "column", gap: 7, flex: 1 } },
          p.findings.map((f, fi) => React.createElement(PersonaFindingMini, { key: fi, f }))),
        React.createElement("div", { style: { padding: "10px 12px", borderTop: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.45 } }, p.summary)))),
    React.createElement(ConflictsSection));
}

function TabsView() {
  const [sel, setSel] = React.useState(0);
  const p = window.PERSONAS[sel];
  return React.createElement("div", { style: { padding: "0 0 40px" } },
    React.createElement("div", { style: { display: "flex", gap: 2, padding: "0 28px", borderBottom: "1px solid var(--border)" } },
      window.PERSONAS.map((pp, i) => {
        const on = sel === i;
        return React.createElement("button", { key: i, onClick: () => setSel(i), style: { display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "none", background: "transparent", borderBottom: "2px solid " + (on ? pp.color : "transparent"), marginBottom: -1, cursor: "pointer" } },
          React.createElement(window.Icon[pp.icon], { size: 15, style: { color: on ? pp.color : "var(--text-muted)" } }),
          React.createElement("span", { style: { fontSize: 13, fontWeight: on ? 600 : 500, color: on ? "var(--text-primary)" : "var(--text-secondary)" } }, pp.name),
          React.createElement("span", { className: "tnum", style: { fontSize: 11, fontWeight: 700, color: pp.score >= 70 ? "var(--ok)" : pp.score >= 50 ? "var(--warn)" : "var(--crit)" } }, pp.score));
      })),
    React.createElement("div", { style: { padding: "20px 28px", maxWidth: 760 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 18, borderLeft: "3px solid " + p.color } },
        React.createElement(window.CircularScore, { score: p.score, size: 44 }),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: p.color } }, p.name + " review"),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } }, p.summary)),
        React.createElement("div", { style: { marginLeft: "auto", textAlign: "right", fontSize: 11.5, color: "var(--text-muted)" } },
          React.createElement("div", { className: "tnum" }, (p.duration_ms / 1000).toFixed(1) + "s"), React.createElement("div", { className: "mono tnum" }, "$" + p.cost.toFixed(2)))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        p.findings.map((f, fi) => React.createElement(window.FindingCard, { key: fi, f, idx: fi })))),
    React.createElement("div", { style: { padding: "0 28px" } }, React.createElement(ConflictsSection)));
}

function ScreenPersonas({ view = "columns", h = 1000 }) {
  return React.createElement(window.AppFrame, { active: "personas", h, crumb: [{ label: "Persona Review" }, { label: "#482", mono: true }] },
    React.createElement("div", { style: { padding: "18px 28px 4px", display: "flex", alignItems: "center", gap: 12 } },
      React.createElement("h1", { style: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } }, "Persona Review"),
      React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-muted)" } }, "the same PR through five lenses")),
    React.createElement(PersonaMetaRow),
    view === "columns" ? React.createElement(ColumnsView) : React.createElement(TabsView));
}

Object.assign(window, { ScreenPersonas });
