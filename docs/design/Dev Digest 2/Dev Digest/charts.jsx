/* charts.jsx — minimal SVG charts: Sparkline, LineChart, BarRow, Donut */

function Sparkline({ data, color = "var(--accent)", w = 80, h = 24 }) {
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  return React.createElement("svg", { width: w, height: h, style: { display: "block", overflow: "visible" } },
    React.createElement("path", { d, fill: "none", stroke: color, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }),
    React.createElement("circle", { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2, fill: color }));
}

function LineChart({ series, w = 620, h = 200, yMin = 0.6, yMax = 1.0 }) {
  const pad = { l: 36, r: 14, t: 14, b: 24 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const n = series[0].data.length;
  const x = (i) => pad.l + (i / (n - 1)) * iw;
  const y = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const grid = [0.6, 0.7, 0.8, 0.9, 1.0];
  return React.createElement("svg", { width: w, height: h, style: { display: "block", maxWidth: "100%" } },
    grid.map((g, i) => React.createElement("g", { key: i },
      React.createElement("line", { x1: pad.l, x2: w - pad.r, y1: y(g), y2: y(g), stroke: "var(--border)", strokeWidth: 1 }),
      React.createElement("text", { x: pad.l - 8, y: y(g) + 3, textAnchor: "end", fontSize: 10, fill: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }, g.toFixed(1)))),
    series.map((s, si) => {
      const d = s.data.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
      return React.createElement("g", { key: si },
        React.createElement("path", { d, fill: "none", stroke: s.color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }),
        React.createElement("circle", { cx: x(n - 1), cy: y(s.data[n - 1]), r: 3, fill: s.color }));
    }));
}

function Donut({ segments, size = 130, stroke = 22 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let off = 0;
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 18 } },
    React.createElement("svg", { width: size, height: size, style: { transform: "rotate(-90deg)", flexShrink: 0 } },
      segments.map((s, i) => {
        const frac = s.value / total;
        const seg = React.createElement("circle", { key: i, cx: size / 2, cy: size / 2, r, fill: "none", stroke: s.color, strokeWidth: stroke, strokeDasharray: `${circ * frac} ${circ}`, strokeDashoffset: -off * circ });
        off += frac; return seg;
      })),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7 } },
      segments.map((s, i) => React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 } },
        React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: s.color } }),
        React.createElement("span", { style: { color: "var(--text-secondary)", flex: 1 } }, s.label),
        React.createElement("span", { className: "mono tnum", style: { color: "var(--text-primary)", fontWeight: 600 } }, "$" + s.value.toFixed(2))))));
}

function BarRow({ label, value, max, color = "var(--accent)", suffix }) {
  return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "150px 1fr 70px", alignItems: "center", gap: 12, padding: "5px 0" } },
    React.createElement("span", { className: "mono", style: { fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
    React.createElement("div", { style: { height: 10, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" } },
      React.createElement("div", { style: { width: (value / max * 100) + "%", height: "100%", background: color, borderRadius: 3 } })),
    React.createElement("span", { className: "mono tnum", style: { fontSize: 12, textAlign: "right", fontWeight: 600 } }, suffix || ""));
}

function MetricCard({ label, value, delta, color, trend, suffix }) {
  const up = delta > 0, flat = delta === 0;
  const dc = flat ? "var(--text-muted)" : up ? "var(--ok)" : "var(--crit)";
  return React.createElement("div", { style: { flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 9, padding: 16 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("span", { style: { fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } }, label),
      trend && React.createElement(Sparkline, { data: trend, color: color || "var(--accent)", w: 56, h: 20 })),
    React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 } },
      React.createElement("span", { className: "tnum", style: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" } }, value, suffix && React.createElement("span", { style: { fontSize: 16, color: "var(--text-muted)" } }, suffix)),
      delta != null && React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600, color: dc } },
        React.createElement(window.Icon[flat ? "Slash" : up ? "ArrowUp" : "ArrowDown"], { size: 12 }),
        React.createElement("span", { className: "tnum" }, Math.abs(delta).toFixed(2)))));
}

Object.assign(window, { Sparkline, LineChart, Donut, BarRow, MetricCard });
