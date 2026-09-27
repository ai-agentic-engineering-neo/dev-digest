/* screen_memory.jsx — cross-session Memory Browser */

const MEM_KIND = {
  decision: { c: "#3b82f6", icon: "GitMerge" }, convention: { c: "#10b981", icon: "ListChecks" },
  preference: { c: "#f59e0b", icon: "User" }, fact: { c: "#999999", icon: "Info" },
  learning: { c: "#8b5cf6", icon: "Brain" },
};
const MEM_SCOPE = { repo: "#3b82f6", global: "#f59e0b", team: "#8b5cf6" };

function MemoryCard({ m, active, onClick }) {
  const k = MEM_KIND[m.kind];
  return React.createElement("div", { onClick, style: { padding: 14, borderRadius: 8, cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"), background: active ? "var(--bg-hover)" : "var(--bg-elevated)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, marginBottom: 8 } },
      React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: k.c, background: k.c + "1a", padding: "2px 7px", borderRadius: 4, textTransform: "capitalize" } },
        React.createElement(window.Icon[k.icon], { size: 11 }), m.kind),
      React.createElement(window.Badge, { color: MEM_SCOPE[m.scope], bg: "transparent", style: { border: "1px solid " + MEM_SCOPE[m.scope] } }, m.scope),
      React.createElement("span", { style: { marginLeft: "auto", fontSize: 10.5, color: "var(--text-muted)" } }, React.createElement(window.ConfidenceNum, { value: m.confidence }))),
    React.createElement("div", { style: { fontSize: 13, lineHeight: 1.5, color: "var(--text-primary)" } }, window.mdLite(m.content)),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" } },
      m.sources.map((s, i) => React.createElement("span", { key: i, className: "mono", style: { fontSize: 11, color: "var(--accent-text)", background: "var(--accent-bg)", padding: "1px 7px", borderRadius: 4 } }, "#" + s.pr)),
      React.createElement("span", { style: { marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" } }, "used " + m.last_used)));
}

function FilterGroup({ label, children }) {
  return React.createElement("div", { style: { marginBottom: 20 } },
    React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 9 } }, label),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, children));
}

function CheckRow({ label, count, on }) {
  return React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)", cursor: "pointer", padding: "2px 0" } },
    React.createElement("span", { style: { width: 15, height: 15, borderRadius: 4, border: "1.5px solid " + (on ? "var(--accent)" : "var(--border-strong)"), background: on ? "var(--accent)" : "transparent", display: "inline-grid", placeItems: "center" } },
      on && React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })),
    React.createElement("span", { style: { flex: 1, textTransform: "capitalize" } }, label),
    count != null && React.createElement("span", { className: "tnum", style: { fontSize: 11, color: "var(--text-muted)" } }, count));
}

function MemoryDetail({ m }) {
  const k = MEM_KIND[m.kind];
  return React.createElement("div", { style: { width: 320, flexShrink: 0, borderLeft: "1px solid var(--border)", padding: 18, background: "var(--bg-surface)", overflow: "auto" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, marginBottom: 14 } },
      React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: k.c, background: k.c + "1a", padding: "2px 8px", borderRadius: 4, textTransform: "capitalize" } },
        React.createElement(window.Icon[k.icon], { size: 12 }), m.kind),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 4 } },
        React.createElement(window.IconBtn, { icon: "Edit", label: "Edit", size: 26 }),
        React.createElement(window.IconBtn, { icon: "Trash", label: "Delete", size: 26, danger: true }))),
    React.createElement("p", { style: { fontSize: 13.5, lineHeight: 1.55, color: "var(--text-primary)" } }, window.mdLite(m.content)),
    React.createElement("div", { style: { display: "flex", gap: 16, margin: "16px 0", paddingBottom: 16, borderBottom: "1px solid var(--border)" } },
      React.createElement("div", null, React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 } }, "CONFIDENCE"), React.createElement("div", { className: "tnum", style: { fontSize: 16, fontWeight: 700 } }, Math.round(m.confidence * 100) + "%")),
      React.createElement("div", null, React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 } }, "SCOPE"), React.createElement("div", { style: { fontSize: 14, fontWeight: 600, textTransform: "capitalize", color: MEM_SCOPE[m.scope] } }, m.scope)),
      React.createElement("div", null, React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 } }, "UPDATED"), React.createElement("div", { style: { fontSize: 13, fontWeight: 500 } }, m.updated))),
    React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10 } }, "Source contexts"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      m.sources.map((s, i) => React.createElement("div", { key: i, style: { padding: "9px 11px", borderRadius: 7, background: "var(--bg-elevated)", border: "1px solid var(--border)" } },
        React.createElement("span", { className: "mono", style: { fontSize: 11.5, color: "var(--accent-text)" } }, "PR #" + s.pr),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.4 } }, s.context)))));
}

function ScreenMemory({ h = 760 }) {
  const [sel, setSel] = React.useState("m2");
  const selM = window.MEMORY.find((m) => m.id === sel);
  return React.createElement(window.AppFrame, { active: "memory", h, crumb: [{ label: "Memory" }] },
    React.createElement("div", { style: { display: "flex", height: h - 52 } },
      // filters sidebar
      React.createElement("div", { style: { width: 200, flexShrink: 0, borderRight: "1px solid var(--border)", padding: 18, background: "var(--bg-surface)", overflow: "auto" } },
        React.createElement(FilterGroup, { label: "Scope" },
          React.createElement(CheckRow, { label: "repo", count: 3, on: true }), React.createElement(CheckRow, { label: "global", count: 1, on: true }), React.createElement(CheckRow, { label: "team", count: 1, on: true })),
        React.createElement(FilterGroup, { label: "Kind" },
          React.createElement(CheckRow, { label: "decision", count: 1, on: true }), React.createElement(CheckRow, { label: "convention", count: 1, on: true }),
          React.createElement(CheckRow, { label: "preference", count: 1, on: false }), React.createElement(CheckRow, { label: "fact", count: 2, on: true }),
          React.createElement(CheckRow, { label: "learning", count: 1, on: true })),
        React.createElement(FilterGroup, { label: "Freshness" },
          React.createElement(CheckRow, { label: "Show stale (>60d)", on: false }))),
      // list
      React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } },
        React.createElement("div", { style: { padding: "16px 20px", borderBottom: "1px solid var(--border)" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } },
            React.createElement("h1", { style: { fontSize: 18, fontWeight: 700 } }, "Memory"),
            React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-muted)" } }, "6 entries · pgvector · curated nightly")),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)" } },
            React.createElement(window.Icon.Search, { size: 15, style: { color: "var(--text-muted)" } }),
            React.createElement("span", { style: { flex: 1, fontSize: 13, color: "var(--text-primary)" } }, "redis connection reuse"),
            React.createElement(window.Badge, { color: "var(--text-muted)" }, "semantic"))),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 } },
          window.MEMORY.map((m) => React.createElement(MemoryCard, { key: m.id, m, active: sel === m.id, onClick: () => setSel(m.id) })))),
      // detail
      React.createElement(MemoryDetail, { m: selM })));
}

Object.assign(window, { ScreenMemory });
