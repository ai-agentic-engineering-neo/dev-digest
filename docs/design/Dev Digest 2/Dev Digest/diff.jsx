/* diff.jsx — Reviewer-Ordered Diff: group headers, file cards, inline code w/ finding markers, split nudger */

// nearest scrollable ancestor + smooth scroll-to (no scrollIntoView — it disrupts the canvas host)
function ddScrollParent(el) {
  let p = el && el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 2) return p;
    p = p.parentElement;
  }
  return null;
}
function ddScrollToEl(el, pad) {
  const sp = ddScrollParent(el);
  if (!sp) return;
  const a = sp.getBoundingClientRect(), b = el.getBoundingClientRect();
  sp.scrollTo({ top: sp.scrollTop + (b.top - a.top) - (pad == null ? 96 : pad), behavior: "smooth" });
}

const ROLE = {
  core: { label: "Core logic", c: "var(--accent)", desc: "The substance of the change — review closely" },
  wiring: { label: "Wiring", c: "var(--warn)", desc: "Hooks the core into the app" },
  boilerplate: { label: "Boilerplate", c: "var(--text-muted)", desc: "Generated / mechanical — skim" },
};

function CodeLine({ ln, file }) {
  const sev = ln.finding ? window.FINDINGS.find((f) => f.id === ln.finding) : null;
  const s = sev ? window.SEV[sev.severity] : null;
  return React.createElement("div", {
    "data-diff-anchor": file ? file + ":" + ln.n : undefined,
    style: { display: "flex", alignItems: "stretch", fontSize: 12, lineHeight: "20px", position: "relative",
      background: ln.s === "add" ? "var(--code-add)" : ln.s === "del" ? "var(--code-del)" : "transparent" },
  },
    s && React.createElement("span", { title: sev.title, style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: s.c } }),
    React.createElement("span", { className: "mono tnum", style: { width: 44, textAlign: "right", padding: "0 8px 0 0", color: "var(--text-muted)", userSelect: "none", flexShrink: 0 } }, ln.n),
    React.createElement("span", { className: "mono", style: { width: 14, textAlign: "center", color: ln.s === "add" ? "var(--code-add-text)" : "var(--text-muted)", flexShrink: 0 } }, ln.s === "add" ? "+" : ln.s === "del" ? "−" : ""),
    React.createElement("span", { className: "mono", style: { flex: 1, whiteSpace: "pre", color: "var(--text-primary)", paddingRight: 10 } }, ln.t || " "),
    s && React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, paddingRight: 10, fontSize: 10.5, color: s.c, fontWeight: 600, flexShrink: 0 } },
      React.createElement(window.Icon[s.icon], { size: 11 }), sev.severity === "CRITICAL" ? "blocker" : sev.severity.toLowerCase()));
}

function DiffFileCard({ file, role, navTarget }) {
  const [open, setOpen] = React.useState(file.finding_lines.length > 0);
  const lines = window.CODE_SNIPPETS[file.path];
  const hasFinding = file.finding_lines.length > 0;
  const rootRef = React.useRef(null);
  const isTarget = navTarget && navTarget.file === file.path;
  // arriving from a brief deep-link: expand, scroll, pulse the exact line
  React.useEffect(() => {
    if (!isTarget) return;
    setOpen(true);
    const id = setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      const lineEl = navTarget.line != null
        ? root.querySelector('[data-diff-anchor="' + file.path + ":" + navTarget.line + '"]')
        : null;
      ddScrollToEl(lineEl || root, lineEl ? 130 : 96);
      if (lineEl) {
        lineEl.classList.remove("dd-line-pulse");
        void lineEl.offsetWidth; // restart the animation
        lineEl.classList.add("dd-line-pulse");
        setTimeout(() => lineEl.classList.remove("dd-line-pulse"), 1700);
      }
    }, 70);
    return () => clearTimeout(id);
  }, [navTarget]);
  return React.createElement("div", { ref: rootRef, "data-file-anchor": file.path, style: { border: "1px solid " + (isTarget ? "var(--accent)" : "var(--border)"), borderRadius: 7, overflow: "hidden", background: "var(--bg-elevated)", transition: "border-color .2s", scrollMarginTop: 130 } },
    React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", cursor: "pointer" } },
      React.createElement(window.Icon.ChevronRight, { size: 13, style: { color: "var(--text-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" } }),
      React.createElement(window.Icon.FileText, { size: 14, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 500 } }, file.path),
      hasFinding && React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: "var(--crit)" }, title: file.finding_lines.length + " finding(s)" }),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } },
        file.pseudocode_summary && React.createElement("span", { title: file.pseudocode_summary, style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--accent-text)", background: "var(--accent-bg)", padding: "2px 7px", borderRadius: 5 } },
          React.createElement(window.Icon.Sparkles, { size: 11 }), "summary"),
        React.createElement("span", { className: "mono tnum", style: { fontSize: 11.5 } },
          React.createElement("span", { style: { color: "var(--code-add-text)" } }, "+" + file.additions), " ",
          React.createElement("span", { style: { color: "var(--code-del-text)" } }, "−" + file.deletions)))),
    open && file.pseudocode_summary && React.createElement("div", { style: { padding: "8px 12px 8px 33px", borderTop: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 7, lineHeight: 1.5 } },
      React.createElement(window.Icon.Sparkles, { size: 13, style: { color: "var(--accent)", flexShrink: 0, marginTop: 2 } }),
      React.createElement("span", null, React.createElement("b", { style: { color: "var(--text-primary)", fontWeight: 600 } }, "What this does: "), file.pseudocode_summary)),
    open && lines && React.createElement("div", { style: { borderTop: "1px solid var(--border)", padding: "6px 0", background: "var(--bg-surface)" } },
      lines.map((ln, i) => React.createElement(CodeLine, { key: i, ln, file: file.path }))),
    open && !lines && React.createElement("div", { style: { padding: "14px 16px", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)", textAlign: "center" } }, "Mechanical changes — diff collapsed by default"));
}

function SplitBanner() {
  const sp = window.DIFF.split_suggestion;
  if (!sp.too_big) return null;
  return React.createElement("div", { style: { border: "1px solid var(--warn)", borderRadius: 8, background: "var(--warn-bg)", padding: 14, marginBottom: 14 } },
    React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "flex-start" } },
      React.createElement(window.Icon.AlertTriangle, { size: 18, style: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } }),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 13.5, fontWeight: 650 } }, "This PR is " + sp.total_lines + " lines. Consider splitting:"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 10 } },
          sp.proposed_splits.map((s, i) => React.createElement("label", { key: i, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" } },
            React.createElement("span", { style: { width: 15, height: 15, borderRadius: 4, border: "1.5px solid var(--border-strong)", display: "inline-grid", placeItems: "center" } }),
            React.createElement("b", { style: { color: "var(--text-primary)", fontWeight: 600 } }, s.name), "·",
            React.createElement("span", { className: "mono", style: { fontSize: 11.5 } }, s.files.join(", "))))),
        React.createElement("div", { style: { marginTop: 12 } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "GitBranch" }, "Generate split PRs")))));
}

function SmartDiff({ navTarget }) {
  const D = window.DIFF;
  const [smart, setSmart] = React.useState(true);
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 14 } },
      React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-secondary)" } }, "9 files · ",
        React.createElement("span", { className: "mono", style: { color: "var(--code-add-text)" } }, "+247"), " ",
        React.createElement("span", { className: "mono", style: { color: "var(--code-del-text)" } }, "−38")),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 } },
        [["smart", "Smart order"], ["orig", "Original order"]].map(([k, l]) => React.createElement("button", {
          key: k, onClick: () => setSmart(k === "smart"),
          style: { padding: "3px 11px", fontSize: 11.5, fontWeight: 600, borderRadius: 5, border: "none",
            background: (smart === (k === "smart")) ? "var(--bg-elevated)" : "transparent", color: (smart === (k === "smart")) ? "var(--text-primary)" : "var(--text-muted)" },
        }, l)))),
    React.createElement(SplitBanner),
    smart ? D.groups.map((g, gi) => {
      const r = ROLE[g.role];
      return React.createElement("div", { key: gi, style: { marginBottom: 18 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, padding: "6px 0", marginBottom: 8, position: "sticky", top: 0 } },
          React.createElement("span", { style: { width: 8, height: 8, borderRadius: 2, background: r.c } }),
          React.createElement("span", { style: { fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" } }, r.label),
          React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, r.desc),
          React.createElement("span", { className: "tnum", style: { marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" } }, g.files.length + " files")),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          g.files.map((f, fi) => React.createElement(DiffFileCard, { key: fi, file: f, role: g.role, navTarget }))));
    }) : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      D.groups.flatMap((g) => g.files).sort((a, b) => a.path.localeCompare(b.path)).map((f, fi) => React.createElement(DiffFileCard, { key: fi, file: f, navTarget }))));
}

Object.assign(window, { SmartDiff, DiffFileCard, SplitBanner });
