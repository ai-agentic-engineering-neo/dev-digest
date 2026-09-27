/* screen_skills.jsx — Skills Lab (list + editor + eval panel) and Eval Dashboard */

function MiniBar({ value, color }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
    React.createElement("div", { style: { flex: 1, height: 6, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" } },
      React.createElement("div", { style: { width: (value * 100) + "%", height: "100%", background: color, borderRadius: 3 } })),
    React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-secondary)", width: 30, textAlign: "right" } }, Math.round(value * 100) + "%"));
}

const SKILL_TYPE = {
  rubric: { c: "#3b82f6", label: "rubric" }, convention: { c: "#10b981", label: "convention" },
  security: { c: "#ef4444", label: "security" }, custom: { c: "#999999", label: "custom" },
};
const SKILL_SOURCE = {
  manual: { icon: "Edit", label: "Manual" }, extracted: { icon: "Wrench", label: "Extracted" },
  community: { icon: "Globe", label: "Community" }, imported_url: { icon: "Link", label: "Imported" },
};

function SkillCard({ s, active, onClick }) {
  const t = SKILL_TYPE[s.type], src = SKILL_SOURCE[s.source];
  const [en, setEn] = React.useState(s.enabled);
  const d = (window.SKILL_DETAIL || {})[s.id];
  return React.createElement("div", { onClick,
    style: { padding: 13, borderRadius: 8, cursor: "pointer", border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
      background: active ? "var(--bg-hover)" : "var(--bg-elevated)", opacity: en ? 1 : 0.6, marginBottom: 8 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      React.createElement("div", { style: { width: 26, height: 26, borderRadius: 7, background: t.c + "1f", color: t.c, display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(window.Icon.Sparkles, { size: 14 })),
      React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.name),
      React.createElement("div", { onClick: (e) => { e.stopPropagation(); setEn(!en); } }, React.createElement(window.Toggle, { on: en, onChange: setEn, size: 14 }))),
    React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", margin: "7px 0", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.description),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
      React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: t.c, background: t.c + "1a", padding: "1px 7px", borderRadius: 4 } }, t.label),
      React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--text-muted)" } },
        React.createElement(window.Icon[src.icon], { size: 11 }), src.label)),
    d && d.usedBy.length > 0 && React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" } },
      React.createElement("span", { className: "tnum" }, d.usedBy.length + (d.usedBy.length === 1 ? " agent" : " agents")),
      React.createElement("span", { className: "tnum" }, Math.round(d.pull * 100) + "% pull"),
      React.createElement("span", { className: "tnum", style: { color: d.accept >= 0.6 ? "var(--ok)" : "var(--warn)" } }, Math.round(d.accept * 100) + "% accept")));
}

function CodeEditor({ code, filename }) {
  const lines = code.split("\n");
  const tokens = Math.round(code.length / 4);
  return React.createElement("div", { style: { border: "1px solid var(--border-strong)", borderRadius: 8, overflow: "hidden", background: "var(--bg-surface)", display: "flex", flexDirection: "column", height: 460 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid var(--border)" } },
      React.createElement(window.Icon.FileText, { size: 14, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, filename),
      React.createElement(window.Badge, { color: "var(--text-muted)" }, "unsaved"),
      React.createElement("span", { className: "mono", style: { marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" } }, tokens.toLocaleString() + " tokens")),
    React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "10px 0" } },
      lines.map((ln, i) => React.createElement("div", { key: i, style: { display: "flex", fontSize: 12.5, lineHeight: "21px" } },
        React.createElement("span", { className: "mono tnum", style: { width: 40, textAlign: "right", paddingRight: 14, color: "var(--text-muted)", userSelect: "none", flexShrink: 0 } }, i + 1),
        React.createElement("span", { className: "mono", style: { whiteSpace: "pre-wrap", color: ln.startsWith("#") ? "var(--accent-text)" : ln.startsWith("-") || ln.match(/^\d+\./) ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: ln.startsWith("#") ? 600 : 400 } }, ln || " ")))));
}

// lightweight markdown renderer: headings, lists, fenced code, paragraphs
function MarkdownPreview({ md }) {
  const lines = md.split("\n");
  const out = []; let i = 0; let key = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith("```")) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) { buf.push(lines[i]); i++; }
      i++;
      out.push(React.createElement("pre", { key: key++, className: "mono", style: { margin: "10px 0", padding: "12px 14px", fontSize: 12, lineHeight: 1.6, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto", color: "var(--text-primary)" } }, buf.join("\n")));
      continue;
    }
    if (/^#{1,3}\s/.test(ln)) {
      const lvl = ln.match(/^#+/)[0].length; const txt = ln.replace(/^#+\s/, "");
      out.push(React.createElement(lvl === 1 ? "h1" : lvl === 2 ? "h2" : "h3", { key: key++, style: { fontSize: lvl === 1 ? 20 : lvl === 2 ? 15.5 : 13.5, fontWeight: 700, letterSpacing: "-0.01em", margin: lvl === 1 ? "4px 0 10px" : "18px 0 8px", color: "var(--text-primary)" } }, window.mdLite(txt)));
      i++; continue;
    }
    if (/^[-*]\s/.test(ln) || /^\d+\.\s/.test(ln)) {
      const items = []; const ordered = /^\d+\.\s/.test(ln);
      while (i < lines.length && (/^[-*]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
        items.push(lines[i].replace(/^([-*]|\d+\.)\s/, "")); i++;
      }
      out.push(React.createElement(ordered ? "ol" : "ul", { key: key++, style: { margin: "6px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 } },
        items.map((it, k) => React.createElement("li", { key: k, style: { fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" } }, window.mdLite(it)))));
      continue;
    }
    if (ln.trim() === "") { i++; continue; }
    out.push(React.createElement("p", { key: key++, style: { fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", margin: "8px 0" } }, window.mdLite(ln)));
    i++;
  }
  return React.createElement("div", { style: { maxWidth: 680, padding: "4px 2px" } }, out);
}

/* ---- skill editor tabs (mirror the agent editor) ---- */

function SkillConfigTab({ s, d }) {
  return React.createElement("div", { style: { maxWidth: 760 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Configuration"),
      React.createElement(window.Badge, { color: "var(--text-secondary)", icon: "GitCommit" }, "v" + (d.version || s.version)),
      React.createElement("label", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" } }, "Enabled", React.createElement(window.Toggle, { on: s.enabled, onChange: () => {}, size: 16 }))),
    React.createElement(window.FormField, { label: "Name", required: true }, React.createElement(window.TextInput, { value: s.name, mono: true })),
    React.createElement(window.FormField, { label: "Description" }, React.createElement(window.TextInput, { value: s.description })),
    React.createElement(window.FormField, { label: "Type" }, React.createElement(window.SelectInput, { value: s.type, options: ["rubric", "convention", "security", "custom"] })),
    React.createElement(window.FormField, { label: "Skill body", required: true, hint: "The only text sent to the model. Editing the body is the entire skill — everything else is metadata." },
      React.createElement(CodeEditor, { code: d.body, filename: s.name + ".md" })),
    React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
      React.createElement(window.Button, { kind: "primary", icon: "Check" }, "Save skill"),
      React.createElement(window.Button, { kind: "ghost" }, "Cancel"),
      React.createElement("span", { style: { marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)", alignSelf: "center" } }, "Saving snapshots the body as ", React.createElement("b", { style: { color: "var(--text-secondary)" } }, "v" + ((d.version || s.version) + 1)))),
    React.createElement("div", { style: { marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--crit)" } }, "Delete skill"),
          React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } }, "Removes it from all agents. This can't be undone.")),
        React.createElement(window.Button, { kind: "danger", size: "sm", icon: "Trash" }, "Delete"))));
}

function SkillContextTab({ s }) {
  return React.createElement(window.SkillContextSection, { key: s.id, asTab: true, initialAttached: (window.SKILL_CONTEXT || {})[s.id] || [] });
}

function SkillPreviewTab({ s, d }) {
  return React.createElement("div", { style: { maxWidth: 720 } },
    React.createElement("h2", { style: { fontSize: 16, fontWeight: 700, marginBottom: 4 } }, "Preview"),
    React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 } }, "Rendered as the reviewing agent receives it."),
    React.createElement(window.Card, null, React.createElement(MarkdownPreview, { md: d.body })));
}

function SkillEvalsTab({ d, onOpenCase }) {
  const cases = window.EVAL_CASES.slice(0, Math.max(3, d.evals.total));
  return React.createElement("div", { style: { maxWidth: 720 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Eval cases"),
      React.createElement(window.Badge, { color: d.evals.pass === d.evals.total ? "var(--ok)" : "var(--warn)", bg: d.evals.pass === d.evals.total ? "var(--ok-bg)" : "var(--warn-bg)" }, d.evals.pass + " / " + d.evals.total + " passing"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8 } },
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Play" }, "Run all evals"),
        React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Plus", onClick: onOpenCase }, "New eval case"))),
    d.evals.total === 0
      ? React.createElement(window.EmptyState, { icon: "FlaskConical", title: "No eval cases yet", body: "Add a case to test this skill against a known diff and expected findings.", cta: "New eval case", onCta: onOpenCase })
      : window.EVAL_CASES.slice(0, d.evals.total).map((ec) => React.createElement(window.EvalCaseRow, { key: ec.id, ec, onClick: onOpenCase })));
}

function SkillStatsTab({ d }) {
  if (!d.usedBy.length) return React.createElement(window.EmptyState, { icon: "BarChart", title: "No usage yet", body: "This skill isn't enabled on any agent. Add it to an agent to start collecting stats." });
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 20 } },
      React.createElement(SkillStat, { label: "USED BY", value: d.usedBy.length, suffix: d.usedBy.length === 1 ? " agent" : " agents" }),
      React.createElement(SkillStat, { label: "PULL FREQUENCY", value: Math.round(d.pull * 100), suffix: "%" }),
      React.createElement(SkillStat, { label: "ACCEPT RATE", value: Math.round(d.accept * 100), suffix: "%", arc: Math.round(d.accept * 100) }),
      React.createElement(SkillStat, { label: "FINDINGS (30D)", value: d.findings30d })),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
      React.createElement(window.Card, null, React.createElement(window.SectionLabel, { icon: "Cpu" }, "Agents using this skill"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          d.usedBy.map((a, i) => React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
            React.createElement("div", { style: { width: 22, height: 22, borderRadius: 6, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center" } }, React.createElement(window.Icon.Cpu, { size: 12 })),
            React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, flex: 1 } }, a),
            React.createElement(window.MonoLink, null, "Open"))))),
      React.createElement(window.Card, null, React.createElement(window.SectionLabel, { icon: "Tag" }, "Findings by category"),
        React.createElement("div", { style: { display: "grid", placeItems: "center", paddingTop: 6 } },
          React.createElement(window.Donut, { segments: [{ label: "security", value: 52, color: "var(--crit)" }, { label: "bug", value: 20, color: "var(--warn)" }, { label: "perf", value: 16, color: "#8b5cf6" }, { label: "style", value: 12, color: "var(--accent)" }], size: 120 })))));
}

function SkillStat({ label, value, suffix, arc }) {
  return React.createElement("div", { style: { flex: 1, padding: 15, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } }, label),
      arc != null && React.createElement(window.CircularScore, { score: arc, size: 32, stroke: 3.5 })),
    React.createElement("div", { style: { marginTop: 10 } },
      React.createElement("span", { className: "tnum", style: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } }, value, suffix && React.createElement("span", { style: { fontSize: 15, color: "var(--text-muted)" } }, suffix))));
}

function SkillVersionsTab({ s, d }) {
  const versions = d.versions || [{ v: s.version || 1, date: "—", note: "Current", current: true }];
  return React.createElement("div", { style: { maxWidth: 720 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Version history"),
      React.createElement(window.Badge, { color: "var(--text-secondary)" }, versions.length + " versions")),
    React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 } }, "Every save snapshots the body so eval runs stay reproducible against the exact text they scored."),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      versions.map((ver, i) => React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8, border: "1px solid " + (ver.current ? "var(--border-strong)" : "var(--border)"), background: "var(--bg-elevated)" } },
        React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 700, color: ver.current ? "var(--accent-text)" : "var(--text-secondary)", background: ver.current ? "var(--accent-bg)" : "var(--bg-hover)", padding: "3px 9px", borderRadius: 6, flexShrink: 0 } }, "v" + ver.v),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: "var(--text-primary)" } }, ver.note),
          React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } }, ver.date)),
        ver.current
          ? React.createElement(window.Badge, { color: "var(--ok)", bg: "var(--ok-bg)", dot: true }, "Current")
          : React.createElement("div", { style: { display: "flex", gap: 6 } },
              React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Eye" }, "Diff"),
              React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "History" }, "Restore"))))));
}

function EvalPanel() {
  const E = window.EVAL;
  return React.createElement("div", { style: { width: 320, flexShrink: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-primary)" } },
    React.createElement("div", { style: { padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 } },
      React.createElement(window.Icon.Gauge, { size: 15, style: { color: "var(--accent)" } }),
      React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, "Eval"),
      React.createElement("div", { style: { marginLeft: "auto" } }, React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Play" }, "Run on 20"))),
    React.createElement("div", { style: { padding: 14, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 } },
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        [["Recall", E.current.recall, E.delta.recall, "var(--accent)"], ["Precision", E.current.precision, E.delta.precision, "var(--ok)"], ["Citation", E.current.citation, E.delta.citation, "var(--warn)"]].map(([l, v, d, c]) =>
          React.createElement("div", { key: l, style: { flex: 1, padding: "9px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text-muted)", fontWeight: 600 } }, l),
            React.createElement("div", { className: "tnum", style: { fontSize: 19, fontWeight: 700, marginTop: 2 } }, Math.round(v * 100)),
            React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: d > 0 ? "var(--ok)" : "var(--crit)" } }, (d > 0 ? "+" : "") + Math.round(d * 100))))),
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-secondary)" } },
        React.createElement("span", null, React.createElement("b", { className: "tnum", style: { color: "var(--text-primary)" } }, E.current.traces_passed + "/" + E.current.traces_total), " traces passed"),
        React.createElement("span", { className: "mono tnum" }, "$" + E.current.cost.toFixed(2))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
        E.traces.map((t) => React.createElement("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 5, background: "var(--bg-elevated)", fontSize: 11.5 } },
          React.createElement(window.Icon[t.pass ? "CheckCircle" : "XCircle"], { size: 13, style: { color: t.pass ? "var(--ok)" : "var(--crit)", flexShrink: 0 } }),
          React.createElement("span", { className: "mono", style: { flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, t.name),
          React.createElement("span", { style: { fontSize: 10, color: "var(--text-muted)" } }, t.pass ? "match" : "miss")))),
      React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Workflow", full: true }, "Export to CI workflow")));
}

function SkillSearchPanel({ onClose }) {
  return React.createElement(window.Drawer, { width: 480, title: "Search community skills", subtitle: "Import vetted skills from public repos", onClose },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", marginBottom: 12 } },
      React.createElement(window.Icon.Search, { size: 15, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { style: { flex: 1, fontSize: 13, color: "var(--text-primary)" } }, "security review"),
      React.createElement(window.Icon.X, { size: 14, style: { color: "var(--text-muted)", cursor: "pointer" } })),
    React.createElement("div", { style: { display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" } },
      React.createElement(window.Chip, { active: true }, "All languages"),
      React.createElement(window.Chip, null, "TypeScript"),
      React.createElement(window.Chip, { icon: "Tag" }, "security"),
      React.createElement(window.Chip, { icon: "Tag" }, "performance")),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
      window.COMMUNITY_SKILLS.map((c, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-elevated)", padding: 14 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 600, flex: 1 } }, c.name),
          React.createElement("span", { className: "tnum", style: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, color: "var(--warn)" } }, React.createElement(window.Icon.Star, { size: 12 }), c.stars.toLocaleString())),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 10px", lineHeight: 1.45 } }, c.desc),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, c.repo),
          React.createElement(window.Badge, { color: "var(--text-muted)" }, c.lang),
          React.createElement("div", { style: { marginLeft: "auto" } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Plus" }, "Import")))))));
}

function ScreenSkillsLab({ h = 860, searchOpen, tab = "Config", onOpenCase }) {
  const [sel, setSel] = React.useState("s1");
  const [t, setT] = React.useState(tab);
  const [drawer, setDrawer] = React.useState(!!searchOpen);
  React.useEffect(() => setT(tab), [tab]);
  const s = window.SKILLS.find((x) => x.id === sel);
  const d = window.SKILL_DETAIL[sel];
  return React.createElement(window.AppFrame, { active: "skills", h, crumb: [{ label: "Skills Lab" }, { label: "Skills" }] },
    drawer && React.createElement(SkillSearchPanel, { onClose: () => setDrawer(false) }),
    React.createElement("div", { style: { display: "flex", height: h - 52 } },
      // left: skill list
      React.createElement("div", { style: { width: 290, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" } },
        React.createElement("div", { style: { padding: "14px 14px 10px" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } },
            React.createElement("h1", { style: { fontSize: 16, fontWeight: 700, flex: 1 } }, "Skills"),
            React.createElement(window.Dropdown, { width: 220, align: "right",
              trigger: React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Plus", iconRight: "ChevronDown" }, "Add Skill"),
              items: [
                { label: "Import from file", icon: "Upload" },
                { label: "Import from URL", icon: "Link" },
                { label: "Search community skills…", icon: "Globe", onClick: () => setDrawer(true) },
                { divider: true },
                { label: "Create from scratch", icon: "Edit" },
              ] })),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-muted)", fontSize: 12 } },
            React.createElement(window.Icon.Search, { size: 13 }), "Search skills…")),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "0 10px 10px" } },
          window.SKILLS.map((sk) => React.createElement(SkillCard, { key: sk.id, s: sk, active: sel === sk.id, onClick: () => setSel(sk.id) })))),
      // center: tabbed editor (mirrors the agent editor)
      React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "14px 24px 0" } },
          React.createElement("div", { style: { width: 26, height: 26, borderRadius: 7, background: SKILL_TYPE[s.type].c + "1f", color: SKILL_TYPE[s.type].c, display: "grid", placeItems: "center" } }, React.createElement(window.Icon.Sparkles, { size: 15 })),
          React.createElement("h1", { className: "mono", style: { fontSize: 16, fontWeight: 700 } }, s.name),
          React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: SKILL_TYPE[s.type].c, background: SKILL_TYPE[s.type].c + "1a", padding: "2px 8px", borderRadius: 5 } }, SKILL_TYPE[s.type].label),
          React.createElement(window.Badge, { color: "var(--text-secondary)", icon: "GitCommit" }, "v" + (d.version || s.version)),
          React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8 } },
            React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Play" }, "Run on evals"))),
        React.createElement("div", { style: { marginTop: 12 } }, React.createElement(window.Tabs, { tabs: ["Config", "Context", "Preview", "Evals", "Stats", "Versions"], value: t, onChange: setT })),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 24 } },
          t === "Config" && React.createElement(SkillConfigTab, { s, d }),
          t === "Context" && React.createElement(SkillContextTab, { s }),
          t === "Preview" && React.createElement(SkillPreviewTab, { s, d }),
          t === "Evals" && React.createElement(SkillEvalsTab, { d, onOpenCase }),
          t === "Stats" && React.createElement(SkillStatsTab, { d }),
          t === "Versions" && React.createElement(SkillVersionsTab, { s, d })))));
}

/* ---- Eval Dashboard ---- */
/* word-level diff for the prompt compare (old vs new) */
function diffTokens(a, b) {
  const aw = a.split(/(\s+)/), bw = b.split(/(\s+)/);
  const n = aw.length, m = bw.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (aw[i] === bw[j]) { out.push({ t: aw[i], k: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: aw[i], k: "del" }); i++; }
    else { out.push({ t: bw[j], k: "add" }); j++; }
  }
  while (i < n) out.push({ t: aw[i++], k: "del" });
  while (j < m) out.push({ t: bw[j++], k: "add" });
  return out;
}

function CompareMetric({ label, oldV, newV, color, pct }) {
  const d = newV - oldV;
  const fmt = (v) => pct ? Math.round(v * 100) + "%" : v;
  return React.createElement("div", { style: { flex: 1, padding: "12px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
    React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 } }, label),
    React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
      React.createElement("span", { className: "tnum", style: { fontSize: 15, color: "var(--text-muted)" } }, fmt(oldV)),
      React.createElement(window.Icon.ArrowRight, { size: 13, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { className: "tnum", style: { fontSize: 21, fontWeight: 700, color } }, fmt(newV)),
      Math.abs(d) > 0.0001 && React.createElement("span", { className: "tnum", style: { fontSize: 11.5, fontWeight: 600, color: d >= 0 ? "var(--ok)" : "var(--crit)" } },
        (d >= 0 ? "\u25B2 " : "\u25BC ") + (pct ? Math.abs(Math.round(d * 100)) + "pt" : Math.abs(d).toFixed(2)))));
}

function RunCompare({ a, b, onClose }) {
  // a = older, b = newer
  const tokens = diffTokens(a.prompt || "", b.prompt || "");
  return React.createElement(window.Modal, { width: 960, onClose,
    title: "Compare runs · " + a.version + " → " + b.version,
    subtitle: "Old prompt vs new — metric deltas and prompt diff on the 20-trace gold set",
    footer: React.createElement("div", { style: { display: "flex", gap: 8, marginLeft: "auto" } },
      React.createElement(window.Button, { kind: "ghost", onClick: onClose }, "Close"),
      React.createElement(window.Button, { kind: "primary", icon: "GitBranch" }, "Promote " + b.version)) },
    React.createElement("div", { style: { padding: "16px 18px", maxHeight: 560, overflow: "auto" } },
      React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 18 } },
        React.createElement(CompareMetric, { label: "Recall", oldV: a.recall, newV: b.recall, color: "var(--accent)", pct: true }),
        React.createElement(CompareMetric, { label: "Precision", oldV: a.precision, newV: b.precision, color: "var(--ok)", pct: true }),
        React.createElement(CompareMetric, { label: "Citation", oldV: a.citation, newV: b.citation, color: "var(--warn)", pct: true }),
        React.createElement(CompareMetric, { label: "Cost", oldV: a.cost, newV: b.cost, color: "var(--text-primary)", pct: false })),
      React.createElement(window.SectionLabel, { icon: "FileText" }, "System prompt diff"),
      React.createElement("div", { style: { display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-secondary)", margin: "8px 0 10px" } },
        React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, React.createElement("span", { style: { width: 11, height: 11, borderRadius: 3, background: "var(--code-del)" } }), a.version + " (old)"),
        React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, React.createElement("span", { style: { width: 11, height: 11, borderRadius: 3, background: "var(--code-add)" } }), b.version + " (new)")),
      React.createElement("div", { className: "mono", style: { fontSize: 12.5, lineHeight: 1.75, background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", whiteSpace: "pre-wrap" } },
        tokens.map((tk, i) => React.createElement("span", { key: i, style: {
          background: tk.k === "add" ? "var(--code-add)" : tk.k === "del" ? "var(--code-del)" : "transparent",
          color: tk.k === "same" ? "var(--text-secondary)" : "var(--text-primary)",
          textDecoration: tk.k === "del" ? "line-through" : "none",
          textDecorationColor: "var(--crit)" } }, tk.t)))));
}

/* landing view: every agent's latest eval at a glance + a cross-agent recent-runs feed */
function AgentEvalOverview({ onOpen }) {
  const E = window.EVAL;
  const agents = window.AGENTS.map((a) => {
    const runs = E.runs.filter((r) => r.agent === a.id);
    return { a, runs, latest: runs[0] };
  });
  const recent = [...E.runs].sort((x, y) => y.ran_at.localeCompare(x.ran_at)).slice(0, 6);
  const agentName = (id) => (window.AGENTS.find((a) => a.id === id) || {}).name || id;
  const Mini = ({ label, v, c }) => React.createElement("div", { style: { textAlign: "center", minWidth: 66 } },
    React.createElement("div", { style: { fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } }, label),
    React.createElement("div", { className: "tnum", style: { fontSize: 18, fontWeight: 700, color: c, marginTop: 2 } }, v == null ? "—" : Math.round(v * 100) + "%"));
  return React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } },
    React.createElement("div", { style: { display: "flex", alignItems: "flex-end", marginBottom: 6 } },
      React.createElement("div", null,
        React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Eval Dashboard"),
        React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Regression harness across all reviewer agents · pick an agent to see its runs")),
      React.createElement("div", { style: { marginLeft: "auto" } },
        React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Play" }, "Run all agents"))),
    React.createElement(window.SectionLabel, { icon: "Cpu" }, "Agents"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, marginTop: 8 } },
      agents.map(({ a, runs, latest }) => React.createElement("button", { key: a.id, onClick: () => onOpen(a.id),
        style: { display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", cursor: "pointer", textAlign: "left", width: "100%", transition: "border-color .12s, background .12s" },
        onMouseEnter: (e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderColor = "var(--border-strong)"; },
        onMouseLeave: (e) => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.borderColor = "var(--border)"; } },
        React.createElement("div", { style: { width: 34, height: 34, borderRadius: 8, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(window.Icon.Cpu, { size: 17 })),
        React.createElement("div", { style: { minWidth: 0, flex: 1 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("span", { style: { fontSize: 14.5, fontWeight: 700 } }, a.name),
            React.createElement("span", { className: "mono", style: { fontSize: 10.5, color: "var(--text-muted)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border)" } }, a.model)),
          React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 } },
            latest ? "Last run " + latest.version + " · " + latest.ran_at + " · " + latest.passed + "/" + latest.total + " pass" : "No eval runs yet")),
        latest && React.createElement(window.Sparkline, { data: runs.map((r) => r.recall).reverse(), color: "var(--accent)", w: 60, h: 24 }),
        React.createElement(Mini, { label: "Recall", v: latest && latest.recall, c: "var(--accent)" }),
        React.createElement(Mini, { label: "Prec", v: latest && latest.precision, c: "var(--ok)" }),
        React.createElement(Mini, { label: "Cite", v: latest && latest.citation, c: "var(--warn)" }),
        React.createElement(window.Icon.ChevronRight, { size: 18, style: { color: "var(--text-muted)", flexShrink: 0 } })))),
    React.createElement(window.SectionLabel, { icon: "History" }, "Recent eval runs · all agents"),
    React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)", marginTop: 8 } },
      recent.map((r, i) => React.createElement("div", { key: r.id, onClick: () => onOpen(r.agent),
        style: { display: "grid", gridTemplateColumns: "180px 150px 70px 1fr 1fr 1fr 80px", gap: 12, padding: "10px 16px", borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", fontSize: 12.5, cursor: "pointer" } },
        React.createElement("span", { style: { fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, agentName(r.agent)),
        React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)", fontSize: 11.5 } }, r.ran_at),
        React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, r.version),
        React.createElement(MiniBar, { value: r.recall, color: "var(--accent)" }),
        React.createElement(MiniBar, { value: r.precision, color: "var(--ok)" }),
        React.createElement(MiniBar, { value: r.citation, color: "var(--warn)" }),
        React.createElement("span", { className: "tnum", style: { fontWeight: 600 } }, r.passed + "/" + r.total)))));
}

function ScreenEval({ h = 880, compareOpen, agentId: agentId0 }) {
  const E = window.EVAL;
  const [openAgent, setOpenAgent] = React.useState(agentId0 || (compareOpen ? "ag1" : null));
  const [sel, setSel] = React.useState(compareOpen ? ["r2", "r1"] : []);
  const [cmp, setCmp] = React.useState(compareOpen ? { a: E.runs.find((r) => r.id === "r2"), b: E.runs.find((r) => r.id === "r1") } : null);
  if (!openAgent) return React.createElement(window.AppFrame, { active: "eval", h, crumb: [{ label: "Skills Lab" }, { label: "Eval Dashboard" }] },
    React.createElement(AgentEvalOverview, { onOpen: setOpenAgent }));
  const agentId = openAgent;
  const agent = window.AGENTS.find((a) => a.id === agentId) || window.AGENTS[0];
  const agentRuns = E.runs.filter((r) => r.agent === agentId);
  const latest = agentRuns[0] || E.runs[0];
  const prev = agentRuns[1];
  const cur = { recall: latest.recall, precision: latest.precision, citation: latest.citation };
  const delta = prev ? { recall: latest.recall - prev.recall, precision: latest.precision - prev.precision, citation: latest.citation - prev.citation } : { recall: 0, precision: 0, citation: 0 };
  const trend = {
    recall: agentRuns.map((r) => r.recall).reverse(),
    precision: agentRuns.map((r) => r.precision).reverse(),
    citation: agentRuns.map((r) => r.citation).reverse(),
  };
  const toggleRun = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : [s[1], id]);
  const pickAgent = (id) => { setOpenAgent(id); setSel([]); };
  const openCompare = () => {
    const rows = sel.map((id) => E.runs.find((r) => r.id === id));
    rows.sort((x, y) => x.ran_at.localeCompare(y.ran_at)); // older first
    setCmp({ a: rows[0], b: rows[1] });
  };
  return React.createElement(window.AppFrame, { active: "eval", h, crumb: [{ label: "Skills Lab" }, { label: "Eval Dashboard" }, { label: agent.name }] },
    cmp && React.createElement(RunCompare, { a: cmp.a, b: cmp.b, onClose: () => setCmp(null) }),
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } },
      React.createElement("button", { onClick: () => setOpenAgent(null),
        style: { display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "4px 8px 4px 4px", borderRadius: 6, border: "none", background: "transparent", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" } },
        React.createElement(window.Icon.ChevronLeft, { size: 16 }), "All agents"),
      React.createElement("div", { style: { display: "flex", alignItems: "flex-end", marginBottom: 18 } },
        React.createElement("div", null,
          React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 } }, agent.name,
            React.createElement("span", { className: "mono", style: { fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", padding: "2px 7px", borderRadius: 5, border: "1px solid var(--border)" } }, agent.model)),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Regression harness · ", React.createElement("span", { className: "mono" }, agentRuns.length), agentRuns.length === 1 ? " run" : " runs", " on the 20-trace gold set")),
        React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } },
          React.createElement(window.Dropdown, { width: 220, align: "right",
            trigger: React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Cpu", iconRight: "ChevronDown" }, agent.name),
            items: window.AGENTS.map((a) => ({ label: a.name, icon: "Cpu", onClick: () => pickAgent(a.id) })) }),
          React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Calendar" }, "30 days"),
          React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Play" }, "Run eval"))),
      // regression alert
      delta.precision < -0.0001 && React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center", padding: "11px 14px", borderRadius: 8, border: "1px solid var(--warn)", background: "var(--warn-bg)", marginBottom: 18 } },
        React.createElement(window.Icon.AlertTriangle, { size: 16, style: { color: "var(--warn)" } }),
        React.createElement("span", { style: { fontSize: 13, color: "var(--text-secondary)" } }, React.createElement("b", { style: { color: "var(--text-primary)" } }, "Precision dipped " + Math.abs(Math.round(delta.precision * 100)) + "pts"), " on ", latest.version, " — a new false positive slipped in. Recall and citation both up.")),
      // metric cards
      React.createElement("div", { style: { display: "flex", gap: 14, marginBottom: 20 } },
        React.createElement(window.MetricCard, { label: "RECALL", value: Math.round(cur.recall * 100), suffix: "%", delta: delta.recall, color: "var(--accent)", trend: trend.recall }),
        React.createElement(window.MetricCard, { label: "PRECISION", value: Math.round(cur.precision * 100), suffix: "%", delta: delta.precision, color: "var(--ok)", trend: trend.precision }),
        React.createElement(window.MetricCard, { label: "CITATION ACCURACY", value: Math.round(cur.citation * 100), suffix: "%", delta: delta.citation, color: "var(--warn)", trend: trend.citation })),
      // trend chart
      React.createElement(window.Card, { style: { marginBottom: 20 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 12 } },
          React.createElement(window.SectionLabel, { icon: "TrendingUp" }, "Metric trend"),
          React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5 } },
            [["Recall", "var(--accent)"], ["Precision", "var(--ok)"], ["Citation", "var(--warn)"]].map(([l, c]) =>
              React.createElement("span", { key: l, style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" } },
                React.createElement("span", { style: { width: 10, height: 2, background: c, borderRadius: 2 } }), l)))),
        React.createElement(window.LineChart, { series: [
          { data: trend.recall, color: "var(--accent)" }, { data: trend.precision, color: "var(--ok)" }, { data: trend.citation, color: "var(--warn)" }], w: 900, h: 200 })),
      // runs table
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } },
        React.createElement(window.SectionLabel, { icon: "History" }, "Recent runs"),
        React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, sel.length === 0 ? "Select two runs to compare" : sel.length + " selected"),
        React.createElement("div", { style: { marginLeft: "auto" } },
          React.createElement(window.Button, { kind: sel.length === 2 ? "primary" : "ghost", size: "sm", icon: "GitCompare", disabled: sel.length !== 2, onClick: openCompare }, "Compare"))),
      React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)", marginTop: 8 } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "34px 150px 70px 1fr 1fr 1fr 90px 80px", gap: 12, padding: "9px 16px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase" } },
          ["", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"].map((c, i) => React.createElement("div", { key: i }, c))),
        E.runs.filter((r) => r.agent === agentId).map((r, i, arr) => {
          const on = sel.includes(r.id);
          return React.createElement("div", { key: r.id, onClick: () => toggleRun(r.id), style: { display: "grid", gridTemplateColumns: "34px 150px 70px 1fr 1fr 1fr 90px 80px", gap: 12, padding: "10px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", fontSize: 12.5, cursor: "pointer", background: on ? "var(--bg-hover)" : "transparent" } },
            React.createElement("div", { style: { width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + (on ? "var(--accent)" : "var(--border-strong)"), background: on ? "var(--accent)" : "transparent", display: "grid", placeItems: "center" } },
              on && React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })),
            React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)", fontSize: 11.5 } }, r.ran_at),
            React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, r.version),
            React.createElement(MiniBar, { value: r.recall, color: "var(--accent)" }),
            React.createElement(MiniBar, { value: r.precision, color: "var(--ok)" }),
            React.createElement(MiniBar, { value: r.citation, color: "var(--warn)" }),
            React.createElement("span", { className: "tnum", style: { fontWeight: 600 } }, r.passed + "/" + r.total),
            React.createElement("span", { className: "mono tnum", style: { color: "var(--text-secondary)" } }, "$" + r.cost.toFixed(2)));
        }))));
}

Object.assign(window, { ScreenSkillsLab, ScreenEval, CodeEditor, MarkdownPreview });
