/* context_docs.jsx — shared UI for attaching project-context .md docs.
   Used by the Agent Editor "Context" tab (N2b) and the Skill Editor section (N2c).
   Stores PATHS, never bodies. */

const DOC_SOURCE = {
  specs:    { c: "var(--accent)", label: "specs" },
  docs:     { c: "#10b981",       label: "docs" },
  insights: { c: "#f59e0b",       label: "insights" },
};

const CONTEXT_TOKEN_CAP = 4000;

function fmtTok(n) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n);
}

/* one list row — mirrors the Skills checklist row, plus path + Eye/Preview */
function ContextDocRow({ doc, attached, onToggle, onPreview, compact }) {
  const [hover, setHover] = React.useState(false);
  const src = DOC_SOURCE[doc.source];
  return React.createElement("div", {
    onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false),
    style: { display: "flex", alignItems: "center", gap: 11, padding: compact ? "8px 10px" : "10px 12px",
      borderRadius: 7, border: "1px solid var(--border)",
      background: attached ? "var(--bg-hover)" : hover ? "var(--bg-surface)" : "var(--bg-elevated)",
      opacity: attached ? 1 : 0.78, transition: "background .12s" } },
    React.createElement(window.Icon.Menu, { size: 14, style: { color: "var(--text-muted)", cursor: "grab", flexShrink: 0 } }),
    React.createElement("button", { onClick: () => onToggle(doc.path),
      style: { width: 16, height: 16, padding: 0, borderRadius: 4, cursor: "pointer", flexShrink: 0,
        border: "1.5px solid " + (attached ? "var(--accent)" : "var(--border-strong)"),
        background: attached ? "var(--accent)" : "transparent", display: "grid", placeItems: "center" } },
      attached && React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })),
    React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" } }, doc.name),
    React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, doc.folder),
    React.createElement("span", { style: { flex: 1 } }),
    React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: src.c, background: src.c + "1a", padding: "1px 7px", borderRadius: 4 } }, src.label),
    React.createElement("button", { onClick: () => onPreview(doc), title: "Preview",
      style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
        border: "1px solid " + (hover ? "var(--border-strong)" : "var(--border)"), background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 11.5, fontWeight: 600 } },
      React.createElement(window.Icon.Eye, { size: 13 }), !compact && "Preview"));
}

/* read-only right-side drawer rendering the doc + attach toggle in the header */
function DocPreviewDrawer({ doc, attached, onToggle, onClose }) {
  const src = DOC_SOURCE[doc.source];
  return React.createElement(window.Drawer, { width: 560, onClose,
    title: React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 9 } },
      React.createElement(window.Icon.FileText, { size: 15, style: { color: src.c } }),
      React.createElement("span", { className: "mono", style: { fontSize: 14 } }, doc.path)),
    subtitle: React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 10 } },
      React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: src.c, background: src.c + "1a", padding: "1px 8px", borderRadius: 4 } }, src.label),
      React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--text-muted)" } },
        React.createElement(window.Icon.Cpu, { size: 12 }), "Used by " + doc.usedBy + (doc.usedBy === 1 ? " agent" : " agents")),
      React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, fmtTok(doc.tokens) + " tokens")) },
    React.createElement("div", { style: { display: "flex", marginBottom: 14 } },
      React.createElement(window.Button, { kind: attached ? "secondary" : "primary", size: "sm", icon: attached ? "Check" : "Plus", onClick: () => onToggle(doc.path) },
        attached ? "Attached" : "Attach")),
    React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", padding: "6px 18px 16px" } },
      React.createElement(window.MarkdownPreview, { md: doc.body })));
}

/* tiny header filter input */
function ContextFilter({ value, onChange, placeholder, width = 200 }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", width, color: "var(--text-muted)", fontSize: 12 } },
    React.createElement(window.Icon.Search, { size: 13 }),
    React.createElement("input", { value, onChange: (e) => onChange(e.target.value), placeholder,
      style: { flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" } }));
}

function useAttached(initial) {
  const [attached, setAttached] = React.useState(initial || []);
  const toggle = (path) => setAttached((a) => a.includes(path) ? a.filter((p) => p !== path) : [...a, path]);
  return [attached, toggle];
}

/* ── N2b: full Project-context list (Agent Editor "Context" tab) ── */
function ProjectContextList({ initialAttached }) {
  const docs = window.PROJECT_DOCS;
  const [attached, toggle] = useAttached(initialAttached);
  const [filter, setFilter] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const shown = docs.filter((d) => (d.name + d.folder).toLowerCase().includes(filter.toLowerCase()));
  // order: attached first (in attach order), then the rest
  const ordered = [...attached.map((p) => window.DOC_BY_PATH[p]).filter(Boolean), ...shown.filter((d) => !attached.includes(d.path))]
    .filter((d) => shown.includes(d));
  const tokens = attached.map((p) => (window.DOC_BY_PATH[p] || {}).tokens || 0).reduce((a, b) => a + b, 0);
  const over = tokens > window.CONTEXT_TOKEN_CAP;

  return React.createElement("div", { style: { maxWidth: 720 } },
    preview && React.createElement(window.DocPreviewDrawer, { doc: preview, attached: attached.includes(preview.path), onToggle: toggle, onClose: () => setPreview(null) }),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
      React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Project context"),
      React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)" }, attached.length + " of " + docs.length + " attached"),
      React.createElement("div", { style: { marginLeft: "auto" } },
        React.createElement(ContextFilter, { value: filter, onChange: setFilter, placeholder: "Filter documents…" }))),
    React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 } },
      "Order matters — earlier docs appear earlier in the assembled ",
      React.createElement("span", { className: "mono", style: { fontSize: 11.5, color: "var(--text-secondary)" } }, "## Project context"),
      " block. Toggle to attach."),
    ordered.length === 0
      ? React.createElement(window.EmptyState, { icon: "Folder", title: "No documents found", body: "Add markdown to specs/ · docs/ · insights/ in the repo, then Re-index.", cta: "Re-index" })
      : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          ordered.map((d) => React.createElement(window.ContextDocRow, { key: d.id, doc: d, attached: attached.includes(d.path), onToggle: toggle, onPreview: setPreview }))),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" } },
      React.createElement("span", { className: "mono", style: { fontSize: 12, fontWeight: 600, color: over ? "var(--crit)" : "var(--text-secondary)" } },
        "≈ " + fmtTok(tokens) + " tokens"),
      over && React.createElement(window.Badge, { color: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertTriangle" }, "over " + fmtTok(window.CONTEXT_TOKEN_CAP) + " soft cap"),
      React.createElement("span", { style: { marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" } },
        "Injected as an untrusted block (",
        React.createElement("span", { className: "mono", style: { fontSize: 11 } }, "## Project context"),
        ") into every run.")));
}

/* ── N2c: compact collapsible section for the Skill Editor ── */
function SkillContextSection({ initialAttached, asTab }) {
  const docs = window.PROJECT_DOCS;
  const [open, setOpen] = React.useState(true);
  const [attached, toggle] = useAttached(initialAttached);
  const [filter, setFilter] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const shown = docs.filter((d) => (d.name + d.folder).toLowerCase().includes(filter.toLowerCase()));
  const ordered = [...attached.map((p) => window.DOC_BY_PATH[p]).filter(Boolean), ...shown.filter((d) => !attached.includes(d.path))]
    .filter((d) => shown.includes(d));

  // serialization preview, grouped by source folder
  const groups = { specs: "Project specifications", docs: "Project docs", insights: "Project insights" };
  const serial = [];
  ["specs", "docs", "insights"].forEach((sx) => {
    const paths = attached.filter((p) => (window.DOC_BY_PATH[p] || {}).source === sx);
    if (paths.length) { serial.push("## " + groups[sx]); paths.forEach((p) => serial.push("- " + p)); }
  });

  const isOpen = asTab ? true : open;
  const header = asTab
    ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, maxWidth: 720 } },
        React.createElement("h2", { style: { fontSize: 16, fontWeight: 700 } }, "Project context to use"),
        React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)" }, attached.length + " attached"),
        React.createElement("div", { style: { marginLeft: "auto" } },
          React.createElement(ContextFilter, { value: filter, onChange: setFilter, placeholder: "Filter documents…", width: 200 })))
    : React.createElement("button", { onClick: () => setOpen(!open),
        style: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" } },
        React.createElement(window.Icon.ChevronDown, { size: 16, style: { color: "var(--text-muted)", transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" } }),
        React.createElement("h3", { style: { fontSize: 14, fontWeight: 700 } }, "Project context to use"),
        React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)" }, attached.length + " attached"),
        open && React.createElement("div", { style: { marginLeft: "auto" }, onClick: (e) => e.stopPropagation() },
          React.createElement(ContextFilter, { value: filter, onChange: setFilter, placeholder: "Filter documents…", width: 180 })));
  return React.createElement("div", { style: asTab ? { maxWidth: 720 } : { marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" } },
    preview && React.createElement(window.DocPreviewDrawer, { doc: preview, attached: attached.includes(preview.path), onToggle: toggle, onClose: () => setPreview(null) }),
    header,
    isOpen && React.createElement("div", { style: { marginTop: 12 } },
      React.createElement("p", { style: { fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 } },
        "Any agent using this skill inherits these documents."),
      ordered.length === 0
        ? React.createElement("div", { style: { padding: "20px 16px", borderRadius: 8, border: "1px dashed var(--border-strong)", background: "var(--bg-elevated)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 13, color: "var(--text-secondary)" } }, "No project context attached to this skill."),
            React.createElement("button", { onClick: () => setFilter(""), style: { marginTop: 8, border: "none", background: "transparent", color: "var(--accent-text)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } }, "+ Attach documents"))
        : React.createElement(React.Fragment, null,
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5 } },
              ordered.map((d) => React.createElement(window.ContextDocRow, { key: d.id, doc: d, attached: attached.includes(d.path), onToggle: toggle, onPreview: setPreview, compact: true }))),
            serial.length > 0 && React.createElement("div", { style: { marginTop: 12 } },
              React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 } }, "Serializes as"),
              React.createElement("pre", { className: "mono", style: { margin: 0, padding: "11px 14px", fontSize: 11.5, lineHeight: 1.7, color: "var(--text-secondary)", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, whiteSpace: "pre-wrap" } }, serial.join("\n"))))));
}

Object.assign(window, { DOC_SOURCE, CONTEXT_TOKEN_CAP, ContextDocRow, DocPreviewDrawer, ProjectContextList, SkillContextSection });
