/* primitives.jsx — atoms & molecules shared across screens */

const SEV = {
  CRITICAL: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon", label: "Critical" },
  WARNING:  { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle", label: "Warning" },
  SUGGESTION: { c: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Lightbulb", label: "Suggestion" },
  INFO: { c: "var(--info)", bg: "var(--info-bg)", icon: "Info", label: "Info" },
};
const CAT = {
  bug: { icon: "Bug", label: "bug" }, security: { icon: "Shield", label: "security" },
  perf: { icon: "Zap", label: "perf" }, style: { icon: "Code", label: "style" },
  test: { icon: "FlaskConical", label: "test" },
};

function Button({ kind = "secondary", size = "md", icon, iconRight, children, active, full, ...rest }) {
  const I = icon && window.Icon[icon];
  const IR = iconRight && window.Icon[iconRight];
  const pad = size === "sm" ? "5px 9px" : size === "lg" ? "10px 18px" : "7px 13px";
  const fs = size === "sm" ? 12.5 : size === "lg" ? 14 : 13;
  const base = {
    display: "inline-flex", alignItems: "center", gap: 7, justifyContent: "center",
    padding: children ? pad : (size === "sm" ? 6 : 8), fontSize: fs, fontWeight: 500,
    borderRadius: 6, border: "1px solid transparent", whiteSpace: "nowrap",
    transition: "background .12s, border-color .12s, color .12s", lineHeight: 1.2,
    width: full ? "100%" : undefined, letterSpacing: "-0.01em",
  };
  const kinds = {
    primary: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
    secondary: { background: "var(--bg-elevated)", color: "var(--text-primary)", borderColor: "var(--border-strong)" },
    tertiary: { background: active ? "var(--bg-hover)" : "transparent", color: active ? "var(--text-primary)" : "var(--text-secondary)", borderColor: "transparent" },
    ghost: { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--border)" },
    danger: { background: "transparent", color: "var(--crit)", borderColor: "var(--border-strong)" },
  };
  const [h, setH] = React.useState(false);
  const hover = h ? {
    primary: { background: "var(--accent-hover)", borderColor: "var(--accent-hover)" },
    secondary: { background: "var(--bg-hover)", borderColor: "var(--text-muted)" },
    tertiary: { background: "var(--bg-hover)", color: "var(--text-primary)" },
    ghost: { background: "var(--bg-hover)", color: "var(--text-primary)" },
    danger: { background: "var(--crit-bg)", borderColor: "var(--crit)" },
  }[kind] : {};
  return React.createElement("button", {
    style: { ...base, ...kinds[kind], ...hover, ...rest.style },
    onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    ...rest, style: { ...base, ...kinds[kind], ...hover, ...(rest.style || {}) },
  }, I && React.createElement(I, { size: fs + 2 }), children, IR && React.createElement(IR, { size: fs + 2 }));
}

function IconBtn({ icon, label, size = 30, active, onClick, danger }) {
  const I = window.Icon[icon];
  const [h, setH] = React.useState(false);
  return React.createElement("button", {
    title: label, "aria-label": label, onClick,
    onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: {
      width: size, height: size, display: "inline-grid", placeItems: "center",
      borderRadius: 6, border: "1px solid transparent",
      background: h ? "var(--bg-hover)" : (active ? "var(--bg-hover)" : "transparent"),
      color: danger && h ? "var(--crit)" : (active || h ? "var(--text-primary)" : "var(--text-secondary)"),
      transition: "background .12s, color .12s",
    },
  }, React.createElement(I, { size: Math.round(size * 0.52) }));
}

function Badge({ children, color = "var(--text-secondary)", bg = "var(--bg-hover)", icon, dot, mono, style }) {
  const I = icon && window.Icon[icon];
  return React.createElement("span", {
    className: mono ? "mono" : undefined,
    style: {
      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px",
      borderRadius: 5, fontSize: 11.5, fontWeight: 600, color, background: bg,
      letterSpacing: mono ? 0 : "0.01em", lineHeight: 1.4, whiteSpace: "nowrap", ...style,
    },
  }, dot && React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: color } }),
     I && React.createElement(I, { size: 12 }), children);
}

function SeverityBadge({ severity, count, compact }) {
  const s = SEV[severity]; const I = window.Icon[s.icon];
  return React.createElement("span", {
    style: {
      display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "2px 6px" : "3px 9px",
      borderRadius: 5, fontSize: 11.5, fontWeight: 600, color: s.c, background: s.bg,
      textTransform: "uppercase", letterSpacing: "0.04em",
    },
  }, React.createElement(I, { size: 12.5 }), compact ? null : s.label, count != null && React.createElement("span", { className: "tnum", style: { opacity: 0.85 } }, count));
}

function CategoryTag({ category }) {
  const c = CAT[category]; if (!c) return null;
  const I = window.Icon[c.icon];
  return React.createElement("span", {
    style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", fontWeight: 500 },
  }, React.createElement(I, { size: 12 }), c.label);
}

function Chip({ children, active, onClick, icon, count, color }) {
  const I = icon && window.Icon[icon];
  const [h, setH] = React.useState(false);
  return React.createElement("button", {
    onClick, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: {
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6,
      fontSize: 12.5, fontWeight: 500, transition: "all .12s",
      border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
      background: active ? "var(--accent-bg)" : (h ? "var(--bg-hover)" : "transparent"),
      color: active ? "var(--accent-text)" : (h ? "var(--text-primary)" : "var(--text-secondary)"),
    },
  }, I && React.createElement(I, { size: 13, style: color ? { color } : undefined }), children,
     count != null && React.createElement("span", { className: "tnum", style: { opacity: 0.7, fontSize: 11 } }, count));
}

function Avatar({ name, size = 22, color }) {
  const initials = name.split(/[\s-]/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const hues = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
  const hue = color || hues[name.charCodeAt(0) % hues.length];
  return React.createElement("span", {
    style: {
      width: size, height: size, borderRadius: 99, flexShrink: 0,
      display: "inline-grid", placeItems: "center", fontSize: size * 0.4, fontWeight: 600,
      background: hue + "22", color: hue, border: "1px solid " + hue + "44",
    },
  }, initials);
}

function ConfidenceNum({ value }) {
  const pct = Math.round(value * 100);
  const c = pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
  return React.createElement("span", {
    className: "mono tnum", title: "Model confidence",
    style: { fontSize: 11, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 },
  }, React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: c } }),
     pct + "% conf");
}

// Compact spend display. `usd` null/undefined => em-dash (no run yet).
function CostBadge({ usd, tokens, size = "sm", muted }) {
  if (usd == null) return React.createElement("span", { className: "mono", style: { fontSize: size === "lg" ? 13 : 12, color: "var(--text-muted)" } }, "—");
  const fs = size === "lg" ? 13 : 11.5;
  const fmt = usd < 1 ? "$" + usd.toFixed(3) : "$" + usd.toFixed(2);
  return React.createElement("span", {
    className: "mono tnum", title: "Cost of this review",
    style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: fs, color: muted ? "var(--text-muted)" : "var(--text-secondary)", fontWeight: 500 },
  }, fmt,
     tokens && React.createElement("span", { style: { color: "var(--text-muted)", fontWeight: 400 } }, tokens));
}

function MonoLink({ children, onClick }) {
  const [h, setH] = React.useState(false);
  return React.createElement("button", {
    className: "mono", onClick, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: {
      background: "none", border: "none", padding: 0, fontSize: 12, cursor: "pointer",
      color: h ? "var(--accent-text)" : "var(--text-secondary)",
      textDecoration: h ? "underline" : "none", textUnderlineOffset: 2,
    },
  }, children);
}

function ProgressBar({ value, color = "var(--accent)", height = 6, bg = "var(--bg-hover)" }) {
  return React.createElement("div", {
    style: { width: "100%", height, background: bg, borderRadius: 99, overflow: "hidden" },
  }, React.createElement("div", {
    style: { width: Math.max(0, Math.min(100, value)) + "%", height: "100%", background: color, borderRadius: 99, transition: "width .4s ease" },
  }));
}

function CircularScore({ score, size = 44, stroke = 4 }) {
  const r = (size - stroke) / 2; const circ = 2 * Math.PI * r;
  const c = score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
  return React.createElement("div", { style: { position: "relative", width: size, height: size, flexShrink: 0 } },
    React.createElement("svg", { width: size, height: size, style: { transform: "rotate(-90deg)" } },
      React.createElement("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--bg-hover)", strokeWidth: stroke }),
      React.createElement("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: c, strokeWidth: stroke, strokeDasharray: circ, strokeDashoffset: circ * (1 - score / 100), strokeLinecap: "round", style: { transition: "stroke-dashoffset .6s ease" } })),
    React.createElement("div", { className: "tnum", style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size * 0.3, fontWeight: 700 } }, score));
}

function Toggle({ on, onChange, size = 18 }) {
  return React.createElement("button", {
    onClick: () => onChange(!on), role: "switch", "aria-checked": on,
    style: {
      width: size * 1.85, height: size + 4, borderRadius: 99, border: "none", padding: 2,
      background: on ? "var(--accent)" : "var(--border-strong)", transition: "background .15s", position: "relative",
    },
  }, React.createElement("span", {
    style: {
      display: "block", width: size, height: size, borderRadius: 99, background: "#fff",
      transform: on ? `translateX(${size * 0.85}px)` : "none", transition: "transform .15s",
      boxShadow: "0 1px 3px rgba(0,0,0,.3)",
    },
  }));
}

function Kbd({ children }) {
  return React.createElement("kbd", {
    className: "mono",
    style: {
      display: "inline-grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 5px",
      fontSize: 10.5, color: "var(--text-secondary)", background: "var(--bg-surface)",
      border: "1px solid var(--border-strong)", borderRadius: 4, lineHeight: 1,
    },
  }, children);
}

function SectionLabel({ children, icon, right }) {
  const I = icon && window.Icon[icon];
  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  }, I && React.createElement(I, { size: 14, style: { color: "var(--text-muted)" } }),
     React.createElement("span", { style: { fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)" } }, children),
     right && React.createElement("div", { style: { marginLeft: "auto" } }, right));
}

function Card({ children, pad = true, style, hover, onClick }) {
  const [h, setH] = React.useState(false);
  return React.createElement("div", {
    onClick, onMouseEnter: () => hover && setH(true), onMouseLeave: () => hover && setH(false),
    style: {
      background: h ? "var(--bg-hover)" : "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 8, padding: pad ? "var(--card-pad)" : 0, transition: "background .12s, border-color .12s",
      cursor: onClick ? "pointer" : undefined, ...style,
    },
  }, children);
}

function EmptyState({ icon, title, body, cta, onCta }) {
  const I = icon && window.Icon[icon];
  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "56px 24px", gap: 6 },
  },
    I && React.createElement("div", { style: { width: 44, height: 44, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", marginBottom: 6 } }, React.createElement(I, { size: 22 })),
    React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } }, title),
    body && React.createElement("div", { style: { fontSize: 13, color: "var(--text-secondary)", maxWidth: 340, lineHeight: 1.5 } }, body),
    cta && React.createElement("div", { style: { marginTop: 10 } }, React.createElement(Button, { kind: "secondary", icon: "Plus", onClick: onCta }, cta)));
}

// markdown-lite: **bold**, `code`, line breaks
function mdLite(text) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**")) return React.createElement("strong", { key: i, style: { fontWeight: 650, color: "var(--text-primary)" } }, p.slice(2, -2));
    if (p.startsWith("`")) return React.createElement("code", { key: i, className: "mono", style: { fontSize: "0.92em", padding: "1px 5px", borderRadius: 4, background: "var(--bg-hover)", color: "var(--accent-text)" } }, p.slice(1, -1));
    return p;
  });
}

Object.assign(window, {
  SEV, CAT, Button, IconBtn, Badge, SeverityBadge, CategoryTag, Chip, Avatar,
  ConfidenceNum, CostBadge, MonoLink, ProgressBar, CircularScore, Toggle, Kbd, SectionLabel,
  Card, EmptyState, mdLite,
});
