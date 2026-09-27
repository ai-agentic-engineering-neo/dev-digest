/* blast.jsx — Blast Radius: tree (default) + graph (drill-in) variants */

function BlastRadiusSummary() {
  const B = window.BLAST;
  const stat = (icon, n, label) => React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)", fontSize: 12.5 } },
    React.createElement(window.Icon[icon], { size: 13, style: { color: "var(--text-muted)" } }),
    React.createElement("b", { className: "tnum", style: { color: "var(--text-primary)", fontWeight: 650 } }, n), label);
  return React.createElement("div", { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" } },
    stat("Code", 2, "symbols"), stat("CornerDownRight", 14, "callers"),
    stat("Globe", 3, "endpoints"), stat("Clock", 1, "cron"));
}

function TreeRow({ icon, children, depth = 0, mono, color, muted, onLine, last }) {
  const I = icon && window.Icon[icon];
  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 7, padding: "3px 0", paddingLeft: depth * 18, position: "relative", fontSize: 12.5 },
  },
    depth > 0 && React.createElement("span", { style: { position: "absolute", left: depth * 18 - 10, top: 0, bottom: last ? "50%" : 0, width: 1, background: "var(--border-strong)" } }),
    depth > 0 && React.createElement("span", { style: { position: "absolute", left: depth * 18 - 10, top: "50%", width: 8, height: 1, background: "var(--border-strong)" } }),
    I && React.createElement(I, { size: 13, style: { color: color || "var(--text-muted)", flexShrink: 0 } }),
    React.createElement("span", { className: mono ? "mono" : undefined, style: { color: muted ? "var(--text-muted)" : "var(--text-primary)", whiteSpace: "nowrap" } }, children),
    onLine);
}

function BlastRadiusTree() {
  const B = window.BLAST;
  const [open, setOpen] = React.useState({ rateLimit: true, bucketKey: false });
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
    B.downstream.map((d, i) => {
      const isOpen = open[d.symbol];
      return React.createElement("div", { key: i, style: { borderRadius: 6 } },
        React.createElement("div", {
          onClick: () => setOpen((o) => ({ ...o, [d.symbol]: !o[d.symbol] })),
          style: { display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 6, cursor: "pointer", background: isOpen ? "var(--bg-hover)" : "transparent" },
        },
          React.createElement(window.Icon.ChevronRight, { size: 13, style: { color: "var(--text-muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .12s" } }),
          React.createElement(window.Icon.Code, { size: 13, style: { color: "var(--accent)" } }),
          React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, d.symbol + "()"),
          React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" } }, d.callers.length + " callers")),
        isOpen && React.createElement("div", { style: { padding: "4px 0 8px 14px" } },
          d.callers.map((c, ci) => React.createElement(TreeRow, { key: ci, icon: "CornerDownRight", depth: 1, last: ci === d.callers.length - 1 && !d.endpoints_affected.length },
            React.createElement(window.MonoLink, null, c.file + ":" + c.line))),
          d.endpoints_affected.length > 0 && React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 0 2px 18px" } },
            d.endpoints_affected.map((e, ei) => React.createElement(window.Badge, { key: ei, mono: true, icon: "Globe", color: "var(--accent-text)", bg: "var(--accent-bg)" }, e))),
          d.crons_affected.length > 0 && React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", padding: "6px 0 2px 18px" } },
            d.crons_affected.map((e, ei) => React.createElement(window.Badge, { key: ei, mono: true, icon: "Clock", color: "var(--warn)", bg: "var(--warn-bg)" }, e)))));
    }));
}

/* Graph drill-in: hierarchical node-link rendered as SVG */
function BlastRadiusGraph() {
  const W = 560, H = 230;
  const root = { x: 70, y: H / 2, label: "rateLimit()" };
  const callers = window.BLAST.downstream[0].callers;
  const endpoints = window.BLAST.downstream[0].endpoints_affected;
  const callerNodes = callers.map((c, i) => ({ x: 290, y: 38 + i * ((H - 70) / (callers.length - 1)), label: c.name, file: c.file }));
  const epNodes = endpoints.map((e, i) => ({ x: 500, y: 60 + i * 55, label: e }));
  const edge = (a, b, c) => React.createElement("path", { key: a.label + b.label, d: `M${a.x + 4},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x - 4},${b.y}`, fill: "none", stroke: c || "var(--border-strong)", strokeWidth: 1.5 });
  const node = (n, color, w = 110) => React.createElement("g", { key: n.label, transform: `translate(${n.x - w / 2},${n.y - 13})` },
    React.createElement("rect", { width: w, height: 26, rx: 6, fill: "var(--bg-elevated)", stroke: color, strokeWidth: 1.25 }),
    React.createElement("text", { x: w / 2, y: 17, textAnchor: "middle", fontSize: 11, fontFamily: "JetBrains Mono, monospace", fill: "var(--text-primary)" }, n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label));
  return React.createElement("div", { style: { overflowX: "auto" } },
    React.createElement("svg", { width: W, height: H, style: { display: "block" } },
      callerNodes.map((c) => edge(root, c)),
      callerNodes.slice(0, 2).map((c) => epNodes.map((e) => edge(c, e, "var(--border)"))),
      node({ ...root, x: 70 }, "var(--accent)", 100),
      callerNodes.map((c) => node(c, "var(--border-strong)", 130)),
      epNodes.map((e) => node({ ...e, label: e.label }, "var(--accent)", 150))),
    React.createElement("div", { style: { display: "flex", gap: 14, fontSize: 11, color: "var(--text-muted)", marginTop: 8, paddingLeft: 4 } },
      React.createElement("span", null, "● changed symbol"),
      React.createElement("span", null, "● callers"),
      React.createElement("span", null, "● endpoints affected")));
}

function BlastRadius({ view }) {
  const [v, setV] = React.useState(view || "tree");
  React.useEffect(() => { if (view) setV(view); }, [view]);
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 10 } },
      React.createElement(BlastRadiusSummary),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 } },
        ["tree", "graph"].map((k) => React.createElement("button", {
          key: k, onClick: () => setV(k),
          style: { padding: "3px 10px", fontSize: 11.5, fontWeight: 600, borderRadius: 5, border: "none", textTransform: "capitalize",
            background: v === k ? "var(--bg-elevated)" : "transparent", color: v === k ? "var(--text-primary)" : "var(--text-muted)" },
        }, k)))),
    v === "tree" ? React.createElement(BlastRadiusTree) : React.createElement(BlastRadiusGraph));
}

Object.assign(window, { BlastRadius, BlastRadiusTree, BlastRadiusGraph, BlastRadiusSummary });
