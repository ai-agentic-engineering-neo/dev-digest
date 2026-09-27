/* screen_trace.jsx — N10 Run Trace + Live Log drawer (live + historical) */

function TraceSection({ icon, title, right, children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 12, background: "var(--bg-elevated)" } },
    React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", cursor: "pointer" } },
      React.createElement(window.Icon[icon], { size: 15, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, title),
      right, React.createElement(window.Icon.ChevronDown, { size: 15, style: { color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" } })),
    open && React.createElement("div", { style: { borderTop: "1px solid var(--border)", padding: 14 } }, children));
}

function ToolCallRow({ tc }) {
  const [open, setOpen] = React.useState(false);
  return React.createElement("div", { style: { borderRadius: 6, border: "1px solid var(--border)", marginBottom: 6, overflow: "hidden" } },
    React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", cursor: "pointer", background: "var(--bg-surface)" } },
      React.createElement(window.Icon.Wrench, { size: 13, style: { color: "var(--warn)" } }),
      React.createElement("span", { className: "mono", style: { fontSize: 12 } }, tc.tool, React.createElement("span", { style: { color: "var(--text-muted)" } }, "(" + tc.args + ")")),
      React.createElement("span", { style: { marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" } }, tc.meta),
      React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-secondary)", width: 50, textAlign: "right" } }, tc.ms + "ms")),
    open && React.createElement("div", { className: "mono", style: { padding: "9px 12px", fontSize: 11.5, color: "var(--text-secondary)", background: "var(--code-bg)", borderTop: "1px solid var(--border)", lineHeight: 1.5 } },
      "args: " + tc.args, React.createElement("br"), "result: " + tc.meta + " (preview truncated)"));
}

function PromptBlock({ label, color, onExpand }) {
  const [h, setH] = React.useState(false);
  return React.createElement("div", { onClick: onExpand, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: { display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 6, cursor: "pointer", background: h ? "var(--bg-hover)" : "transparent" } },
    React.createElement("span", { style: { width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 } }),
    React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, flex: 1 } }, label),
    React.createElement("span", { onClick: (e) => e.stopPropagation(), title: "Copy block", style: { display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 5, color: "var(--text-muted)" } }, React.createElement(window.Icon.Copy, { size: 13 })),
    React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: h ? "var(--accent-text)" : "var(--text-muted)", fontWeight: 500 } }, React.createElement(window.Icon.ExternalLink, { size: 12 }), "expand"));
}

function highlightLine(line, q) {
  if (!q) return line || " ";
  const lc = line.toLowerCase(), qlc = q.toLowerCase();
  const out = []; let i = 0, k = 0;
  while (true) {
    const idx = lc.indexOf(qlc, i);
    if (idx === -1) { out.push(line.slice(i)); break; }
    if (idx > i) out.push(line.slice(i, idx));
    out.push(React.createElement("mark", { key: k++, style: { background: "var(--warn)", color: "#000", borderRadius: 2, padding: "0 1px" } }, line.slice(idx, idx + q.length)));
    i = idx + q.length;
  }
  return out;
}

function PromptSearchModal({ title, text, onClose }) {
  const [q, setQ] = React.useState("");
  const lines = text.split("\n");
  const shown = q ? lines.filter((l) => l.toLowerCase().includes(q.toLowerCase())) : lines;
  const matchCount = q ? shown.length : 0;
  return React.createElement(window.Modal, { width: 900, title, onClose },
    React.createElement("div", { style: { padding: "16px 20px 0" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" } },
        React.createElement(window.Icon.Search, { size: 15, style: { color: "var(--text-muted)" } }),
        React.createElement("input", { autoFocus: true, value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search in this block\u2026",
          style: { flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit" } }),
        q && React.createElement("span", { className: "tnum", style: { fontSize: 11.5, color: "var(--text-muted)" } }, matchCount + " line" + (matchCount === 1 ? "" : "s")),
        q && React.createElement(window.Icon.X, { size: 14, style: { color: "var(--text-muted)", cursor: "pointer" }, onClick: () => setQ("") }))),
    React.createElement("pre", { className: "mono", style: { margin: "14px 20px 20px", padding: 14, fontSize: 12, lineHeight: 1.6, color: "var(--text-primary)", background: "var(--code-bg)", borderRadius: 8, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: "58vh" } },
      shown.length ? shown.map((l, i) => React.createElement("div", { key: i }, highlightLine(l, q)))
        : React.createElement("span", { style: { color: "var(--text-muted)" } }, "No lines match \u201c" + q + "\u201d")),
    React.createElement("div", { style: { padding: "0 20px 18px" } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Copy" }, "Copy")));
}

function TraceDrawer({ running, onClose, promptOpen }) {
  const T = window.TRACE;
  const PROMPT_BLOCKS = [
    { key: "system", label: "System", color: "var(--text-muted)", text: T.prompt.system },
    { key: "skills", label: "Skills — enabled skill bodies", color: "#8b5cf6", text: T.prompt.skills },
    { key: "projectContext", label: "Project context — attached specs (untrusted)", color: "var(--accent)", text: T.prompt.projectContext },
    { key: "repoSkeleton", label: "Repo skeleton — repo-intel (dynamic)", color: "var(--accent)", text: T.prompt.repoSkeleton },
    { key: "callers", label: "Callers of changed symbols — repo-intel (dynamic)", color: "var(--warn)", text: T.prompt.callers },
    { key: "user", label: "User / diff (dynamic)", color: "var(--ok)", text: T.prompt.user },
  ];
  const [promptModal, setPromptModal] = React.useState(() => promptOpen ? PROMPT_BLOCKS.find((b) => b.key === promptOpen) : null);
  const stat = (label, val) => React.createElement("div", { style: { flex: 1, padding: "9px 11px", borderRadius: 7, background: "var(--bg-surface)", border: "1px solid var(--border)" } },
    React.createElement("div", { style: { fontSize: 10, color: "var(--text-muted)", fontWeight: 600 } }, label),
    React.createElement("div", { className: "tnum", style: { fontSize: 15, fontWeight: 700, marginTop: 3 } }, val));
  const [liveTab, setLiveTab] = React.useState(running ? "log" : "trace");
  return React.createElement(React.Fragment, null,
   React.createElement(window.Drawer, { width: 720, title: "Agent run · " + T.agent + " · PR #" + T.pr, subtitle: T.ts + (running ? " · running" : " · completed"), onClose,
    footer: React.createElement("div", { style: { display: "flex", gap: 8 } },
      React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Copy" }, "Copy raw output"),
      running && React.createElement(window.Button, { kind: "danger", size: "sm", icon: "X" }, "Stop run")) },
    React.createElement(window.Tabs, { tabs: ["trace", "log"], value: liveTab, onChange: setLiveTab, pad: "0 0 0 0" }),
    React.createElement("div", { style: { paddingTop: 16 } },
      liveTab === "trace" ? React.createElement(React.Fragment, null,
        React.createElement(TraceSection, { icon: "Settings", title: "Configuration" },
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 9, fontSize: 12.5 } },
            React.createElement("div", { style: { display: "flex", gap: 10 } }, React.createElement("span", { style: { color: "var(--text-muted)", width: 110 } }, "Model"), React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, T.model)),
            React.createElement("div", { style: { display: "flex", gap: 10 } }, React.createElement("span", { style: { color: "var(--text-muted)", width: 110 } }, "Skills loaded"), React.createElement("div", { style: { display: "flex", gap: 5, flexWrap: "wrap" } }, T.skills.map((s, i) => React.createElement(window.Badge, { key: i, mono: true, color: "var(--text-secondary)" }, s)))),
            React.createElement("div", { style: { display: "flex", gap: 10 } }, React.createElement("span", { style: { color: "var(--text-muted)", width: 110 } }, "Memory pulled"), React.createElement("span", null, T.memoryPulled.length + " items")),
            React.createElement("div", { style: { display: "flex", gap: 10 } }, React.createElement("span", { style: { color: "var(--text-muted)", width: 110 } }, "Specs read"), React.createElement("div", { style: { display: "flex", gap: 5, flexWrap: "wrap" } }, T.specsRead.map((s, i) => React.createElement("span", { key: i, className: "mono", style: { fontSize: 11, color: "var(--text-secondary)" } }, s)))))),
        React.createElement(TraceSection, { icon: "Gauge", title: "Stats", right: React.createElement(window.Badge, { color: "var(--ok)", bg: "var(--ok-bg)", icon: "Check" }, T.stats.grounding) },
          React.createElement("div", { style: { display: "flex", gap: 8 } },
            stat("DURATION", (T.stats.duration_ms / 1000).toFixed(1) + "s"), stat("TOKENS", (T.stats.tokens_in / 1000).toFixed(0) + "k→" + (T.stats.tokens_out / 1000).toFixed(1) + "k"), stat("COST", "$" + T.stats.cost.toFixed(2)), stat("FINDINGS", T.stats.findings))),
        React.createElement(TraceSection, { icon: "FileText", title: "Prompt assembly", defaultOpen: true },
          PROMPT_BLOCKS.map((b) => React.createElement(PromptBlock, { key: b.key, label: b.label, color: b.color, onExpand: () => setPromptModal(b) }))),
        React.createElement(TraceSection, { icon: "Wrench", title: "Tool calls", right: React.createElement(window.Badge, { color: "var(--text-muted)" }, T.toolCalls.length) },
          T.toolCalls.map((tc, i) => React.createElement(ToolCallRow, { key: i, tc }))),
        React.createElement(TraceSection, { icon: "Code", title: "Raw output", defaultOpen: false },
          React.createElement("pre", { className: "mono", style: { margin: 0, padding: "10px 12px", fontSize: 11.5, lineHeight: 1.5, color: "var(--text-primary)", background: "var(--code-bg)", borderRadius: 6, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 220 } }, T.rawOutput)))
      : React.createElement(window.LiveLogStream, { log: T.log, running, height: 420 }))),
   promptModal && React.createElement(PromptSearchModal, { title: promptModal.label, text: promptModal.text, onClose: () => setPromptModal(null) }));
}

// Standalone framed version for the design canvas — shows the drawer over a dimmed app backdrop
function ScreenTrace({ running = false, h = 900, promptOpen }) {
  return React.createElement("div", { style: { position: "relative", width: "100%", height: h, overflow: "hidden", background: "var(--bg-primary)" } },
    React.createElement("div", { style: { filter: "saturate(0.7)", pointerEvents: "none", height: "100%", overflow: "hidden" } },
      React.createElement(window.ScreenPRDetail, { blastView: "tree", tab: "runs", h: 2200 })),
    React.createElement(TraceDrawer, { running, promptOpen, onClose: () => {} }));
}

Object.assign(window, { ScreenTrace, TraceDrawer });
