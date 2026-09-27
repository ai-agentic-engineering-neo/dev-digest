/* screen_agentperf.jsx — N11 Agent Performance (replaces Cost) */

function PerfSummaryCard({ label, value, suffix, sub, spark, arc, agentName }) {
  return React.createElement("div", { style: { flex: 1, padding: 16, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } }, label),
      arc != null && React.createElement(window.CircularScore, { score: arc, size: 34, stroke: 4 })),
    agentName
      ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 } },
          React.createElement("div", { style: { width: 28, height: 28, borderRadius: 7, background: "rgba(239,68,68,0.12)", color: "var(--crit)", display: "grid", placeItems: "center" } }, React.createElement(window.Icon.Shield, { size: 15 })),
          React.createElement("div", null, React.createElement("div", { style: { fontSize: 14, fontWeight: 700 } }, agentName), React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)" } }, "142 runs · 78% accept")))
      : React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 7, marginTop: 12 } },
          React.createElement("span", { className: "tnum", style: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" } }, value, suffix && React.createElement("span", { style: { fontSize: 15, color: "var(--text-muted)" } }, suffix)),
          sub && React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: sub.startsWith("-") ? "var(--ok)" : "var(--crit)" } }, sub)),
    spark && React.createElement("div", { style: { marginTop: 10 } }, React.createElement(window.Sparkline, { data: spark, color: "var(--accent)", w: 200, h: 28 })));
}

function PerfRow({ a, expanded, onToggle }) {
  const [h, setH] = React.useState(false);
  return React.createElement("div", { style: { borderBottom: "1px solid var(--border)" } },
    React.createElement("div", { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false), onClick: onToggle,
      style: { display: "grid", gridTemplateColumns: "1fr 90px 90px 100px 110px 90px 70px", gap: 12, padding: "12px 18px", alignItems: "center", cursor: "pointer", background: h ? "var(--bg-surface)" : "transparent" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("div", { style: { width: 28, height: 28, borderRadius: 7, background: a.color + "1f", color: a.color, display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(window.Icon[a.icon], { size: 15 })),
        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600 } }, a.name)),
      React.createElement("span", { className: "tnum", style: { fontSize: 13 } }, a.runs),
      React.createElement("span", { className: "mono tnum", style: { fontSize: 12.5 } }, "$" + a.cost.toFixed(2)),
      React.createElement("span", { className: "tnum", style: { fontSize: 12.5 } }, a.duration + "s"),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement("span", { className: "tnum", style: { fontSize: 13, fontWeight: 600, color: a.accept >= 0.6 ? "var(--ok)" : "var(--warn)" } }, Math.round(a.accept * 100) + "%"),
        React.createElement(window.Icon[a.acceptDelta > 0 ? "ArrowUp" : "ArrowDown"], { size: 12, style: { color: a.acceptDelta > 0 ? "var(--ok)" : "var(--crit)" } })),
      React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, a.last),
      React.createElement(window.MonoLink, null, "View")),
    expanded && React.createElement("div", { style: { padding: "0 18px 14px 56px", display: "flex", alignItems: "center", gap: 20, animation: "ddpop .15s ease" } },
      React.createElement(window.Sparkline, { data: a.spark, color: a.color, w: 160, h: 34 }),
      React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, "last 5 runs · ", React.createElement("span", { className: "mono" }, "avg " + a.duration + "s · $" + a.cost.toFixed(2)))));
}

function ScreenAgentPerf({ h = 880 }) {
  const P = window.AGENT_PERF;
  const [exp, setExp] = React.useState(null);
  return React.createElement(window.AppFrame, { active: "agent-perf", h, crumb: [{ label: "Agent Performance" }] },
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 1000, margin: "0 auto" } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-end", marginBottom: 18 } },
        React.createElement("div", null,
          React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Agent Performance"),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Which agents earn their keep — accept rate is the quality signal")),
        React.createElement("div", { style: { marginLeft: "auto" } }, React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Calendar" }, "30 days"))),
      React.createElement("div", { style: { display: "flex", gap: 14, marginBottom: 22 } },
        React.createElement(PerfSummaryCard, { label: "TOTAL RUNS (30D)", value: P.summary.runs30d, spark: [210, 225, 218, 240, 235, 248, 255, 253] }),
        React.createElement(PerfSummaryCard, { label: "TOTAL COST (30D)", value: "$" + P.summary.cost30d.toFixed(2), sub: "-$1.20" }),
        React.createElement(PerfSummaryCard, { label: "AVG ACCEPT RATE", value: Math.round(P.summary.avgAccept * 100), suffix: "%", arc: Math.round(P.summary.avgAccept * 100) }),
        React.createElement(PerfSummaryCard, { label: "MOST-ACTIVE AGENT", agentName: "Security Reviewer" })),
      React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg-elevated)", marginBottom: 24 } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 90px 90px 100px 110px 90px 70px", gap: 12, padding: "10px 18px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } },
          ["Agent", "Runs 30d", "Avg cost", "Avg dur.", "Accept ↓", "Last run", ""].map((c, i) => React.createElement("div", { key: i }, c))),
        P.agents.map((a) => React.createElement(PerfRow, { key: a.id, a, expanded: exp === a.id, onToggle: () => setExp(exp === a.id ? null : a.id) }))),
      React.createElement(window.SectionLabel, { icon: "DollarSign" }, "Cost breakdown"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
        React.createElement(window.Card, null, React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 14 } }, "By agent"), React.createElement(window.Donut, { segments: P.byAgentCost, size: 120 })),
        React.createElement(window.Card, null, React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 14 } }, "By model"), React.createElement(window.Donut, { segments: P.byModelCost, size: 120 })))));
}

Object.assign(window, { ScreenAgentPerf });
