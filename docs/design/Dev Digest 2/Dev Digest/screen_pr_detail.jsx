/* screen_pr_detail.jsx — the priority screen */

function IntentBlock() {
  const I = window.INTENT;
  return React.createElement("div", null,
    React.createElement("p", { style: { fontSize: 14, lineHeight: 1.5, fontStyle: "italic", color: "var(--text-primary)", marginBottom: 14, textWrap: "pretty" } }, "“" + I.intent + "”"),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 } },
      React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--ok)", marginBottom: 7, letterSpacing: "0.04em" } }, React.createElement(window.Icon.Check, { size: 13 }), "IN SCOPE"),
        React.createElement("ul", { style: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 } },
          I.in_scope.map((s, i) => React.createElement("li", { key: i, style: { fontSize: 12.5, color: "var(--text-secondary)", display: "flex", gap: 7, lineHeight: 1.45 } },
            React.createElement("span", { style: { color: "var(--ok)", marginTop: 1 } }, "·"), s)))),
      React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 7, letterSpacing: "0.04em" } }, React.createElement(window.Icon.X, { size: 13 }), "OUT OF SCOPE"),
        React.createElement("ul", { style: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 } },
          I.out_of_scope.map((s, i) => React.createElement("li", { key: i, style: { fontSize: 12.5, color: "var(--text-muted)", display: "flex", gap: 7, lineHeight: 1.45 } },
            React.createElement("span", { style: { marginTop: 1 } }, "·"), s))))));
}

const RISK_ICON = { security: "Shield", db_migration: "Database", breaking_api: "AlertOctagon", perf: "Zap", deps: "Boxes" };
const RISK_SEV = { high: "var(--crit)", medium: "var(--warn)", low: "var(--info)" };

function RiskPillRow({ onGoto }) {
  const [open, setOpen] = React.useState(null);
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
      window.RISKS.map((r, i) => {
        const a = r.anchor || {};
        const expanded = open === i;
        return React.createElement("div", { key: i, style: { display: "inline-flex", alignItems: "stretch", borderRadius: 7, overflow: "hidden",
          border: "1px solid " + (expanded ? RISK_SEV[r.severity] : "var(--border)"), background: expanded ? "var(--bg-hover)" : "transparent" } },
          React.createElement("button", { onClick: () => onGoto && onGoto(a.file, a.line), title: "Jump to " + (r.file_refs[0] || a.file),
            style: { display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", padding: "5px 9px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" } },
            React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } },
              React.createElement(window.Icon[RISK_ICON[r.kind]], { size: 13, style: { color: RISK_SEV[r.severity] } }), r.title),
            React.createElement("span", { className: "mono", style: { fontSize: 10.5, color: "var(--accent-text)" } }, r.file_refs[0])),
          React.createElement("button", { onClick: () => setOpen(expanded ? null : i), title: "Why this is a risk",
            style: { display: "grid", placeItems: "center", width: 26, border: "none", borderLeft: "1px solid var(--border)", background: "transparent", cursor: "pointer" } },
            React.createElement(window.Icon.ChevronDown, { size: 14, style: { color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" } })));
      })),
    open != null && React.createElement("div", { style: { marginTop: 10, padding: "10px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", animation: "ddpop .15s ease" } },
      React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)" } }, window.mdLite(window.RISKS[open].explanation)),
      React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 8 } },
        window.RISKS[open].file_refs.map((fr, i) => React.createElement(window.MonoLink, { key: i, onClick: () => onGoto && onGoto(window.RISKS[open].anchor.file, window.RISKS[open].anchor.line) }, fr)))));
}

function ReviewFocusBlock({ onGoto }) {
  const F = window.REVIEW_FOCUS;
  if (!F || !F.length) return null;
  return React.createElement("div", { style: { marginTop: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", padding: "14px 16px" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } },
      React.createElement(window.Icon.ListChecks, { size: 14, style: { color: "var(--accent)" } }),
      React.createElement("span", { style: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" } }, "Review focus — read these first"),
      React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)" }, F.length)),
    React.createElement("ol", { style: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 } },
      F.map((it, i) => React.createElement("li", { key: i },
        React.createElement("button", { onClick: () => onGoto && onGoto(it.file, it.line), title: "Open " + it.file + ":" + it.line + " in Files changed",
          style: { display: "flex", alignItems: "baseline", gap: 9, width: "100%", padding: "7px 8px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" },
          onMouseEnter: (e) => (e.currentTarget.style.background = "var(--bg-hover)"), onMouseLeave: (e) => (e.currentTarget.style.background = "transparent") },
          React.createElement("span", { style: { color: "var(--accent)", fontSize: 12, flexShrink: 0 } }, "▸"),
          React.createElement("span", { className: "mono", style: { fontSize: 11.5, color: "var(--accent-text)", flexShrink: 0, whiteSpace: "nowrap" } }, it.file + ":" + it.line),
          React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 } }, "— " + it.reason))))));
}

function BriefSkeleton() {
  return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
    [0, 1].map((c) => React.createElement(window.Card, { key: c },
      React.createElement("div", { className: "skeleton", style: { height: 12, width: "40%", marginBottom: 14 } }),
      ["92%", "86%", "74%", "60%"].map((w, i) => React.createElement("div", { key: i, className: "skeleton", style: { height: 10, width: w, marginBottom: 9 } })),
      React.createElement("div", { style: { height: 1, background: "var(--border)", margin: "14px 0" } }),
      ["80%", "64%"].map((w, i) => React.createElement("div", { key: i, className: "skeleton", style: { height: 10, width: w, marginBottom: 9 } })))));
}

function BriefEmpty({ onGenerate }) {
  return React.createElement(window.Card, { style: { minHeight: 320, display: "grid", placeItems: "center" } },
    React.createElement("div", { style: { textAlign: "center", maxWidth: 340 } },
      React.createElement("div", { style: { width: 48, height: 48, borderRadius: 12, background: "var(--bg-hover)", display: "grid", placeItems: "center", margin: "0 auto 14px" } },
        React.createElement(window.Icon.FileText, { size: 24, style: { color: "var(--text-muted)" } })),
      React.createElement("div", { style: { fontSize: 15, fontWeight: 700, marginBottom: 6 } }, "No brief yet"),
      React.createElement("p", { style: { fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)", marginBottom: 18 } }, "Generate a Why+Risk brief for this PR."),
      React.createElement("div", { style: { display: "flex", justifyContent: "center" } },
        React.createElement(window.Button, { kind: "primary", icon: "FileText", onClick: onGenerate }, "Generate brief"))));
}

function HistoryRow({ h, last }) {
  return React.createElement("div", { style: { display: "flex", gap: 12, padding: "10px 14px", borderBottom: last ? "none" : "1px solid var(--border)" } },
    React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 } },
      React.createElement("span", { style: { width: 8, height: 8, borderRadius: 99, background: "var(--text-muted)", border: "2px solid var(--bg-elevated)" } }),
      !last && React.createElement("span", { style: { width: 1, flex: 1, background: "var(--border)", marginTop: 2 } })),
    React.createElement("div", { style: { flex: 1 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
        React.createElement("span", { className: "mono", style: { fontSize: 12, color: "var(--accent-text)" } }, "#" + h.pr_number),
        React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, h.title)),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, margin: "4px 0 6px", fontSize: 11.5, color: "var(--text-muted)" } },
        React.createElement(window.Avatar, { name: h.author, size: 15 }), h.author, "·", h.merged_at),
      React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)" } }, window.mdLite(h.notes))));
}

function HistoryAccordion() {
  const [open, setOpen] = React.useState(false);
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" } },
    React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", background: open ? "var(--bg-surface)" : "transparent" } },
      React.createElement(window.Icon.History, { size: 14, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600 } }, "Prior PRs touching these files"),
      React.createElement(window.Badge, { color: "var(--text-secondary)" }, window.HISTORY.length),
      React.createElement(window.Icon.ChevronDown, { size: 15, style: { marginLeft: "auto", color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" } })),
    open && React.createElement("div", { style: { borderTop: "1px solid var(--border)", padding: "4px 0" } },
      window.HISTORY.map((h, i) => React.createElement(HistoryRow, { key: i, h, last: i === window.HISTORY.length - 1 }))));
}

function BriefCard({ blastView, onGoto, briefState }) {
  const [state, setState] = React.useState(briefState || "ready");
  const regen = () => { setState("loading"); setTimeout(() => setState("ready"), 1500); };
  if (state === "empty") return React.createElement(BriefEmpty, { onGenerate: regen });
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement(window.VerdictBanner, { onRegenerate: regen, loading: state === "loading" }),
    state === "loading"
      ? React.createElement(BriefSkeleton)
      : React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
            React.createElement(window.Card, null,
              React.createElement(window.SectionLabel, { icon: "Target" }, "Intent"),
              React.createElement(IntentBlock),
              React.createElement("div", { style: { height: 1, background: "var(--border)", margin: "16px 0" } }),
              React.createElement(window.SectionLabel, { icon: "AlertTriangle" }, "Risk areas"),
              React.createElement(RiskPillRow, { onGoto })),
            React.createElement(window.Card, null,
              React.createElement(window.SectionLabel, { icon: "Workflow" }, "Blast radius"),
              React.createElement(window.BlastRadius, { view: blastView }),
              React.createElement("div", { style: { height: 1, background: "var(--border)", margin: "16px 0" } }),
              React.createElement(HistoryAccordion))),
          React.createElement(ReviewFocusBlock, { onGoto })));
}

function ComposeReviewDrawer({ onClose }) {
  const accepted = window.FINDINGS.filter((f) => f.severity !== "SUGGESTION");
  return React.createElement(window.Drawer, { width: 640, title: "Compose Review for PR #482", subtitle: accepted.length + " findings selected · post as your review", onClose,
    footer: React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
      React.createElement("span", { style: { fontSize: 12, color: "var(--text-muted)", marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 8 } }, React.createElement(window.Avatar, { name: "you", size: 18 }), "Posting as ", React.createElement("span", { className: "mono" }, "@you"), React.createElement("span", { style: { color: "var(--border-strong)" } }, "·"), React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 } }, "this review cost ", React.createElement(window.CostBadge, { usd: window.VERDICT.cost }))),
      React.createElement(window.Button, { kind: "ghost", onClick: onClose }, "Cancel"),
      React.createElement(window.Button, { kind: "primary", icon: "Upload" }, "Post review")) },
    React.createElement(window.SectionLabel, { icon: "ListChecks" }, "Findings to include"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 } },
      accepted.map((f) => { const s = window.SEV[f.severity];
        return React.createElement("label", { key: f.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
          React.createElement("span", { style: { width: 15, height: 15, borderRadius: 4, background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })),
          React.createElement(window.Icon[s.icon], { size: 13, style: { color: s.c, flexShrink: 0 } }),
          React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, flex: 1 } }, f.title),
          React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, f.file + ":" + f.start_line),
          React.createElement(window.Icon.X, { size: 13, style: { color: "var(--text-muted)", cursor: "pointer" } })); })),
    React.createElement(window.SectionLabel, { icon: "Edit" }, "Review draft"),
    React.createElement("div", { style: { border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-elevated)", padding: 14, marginBottom: 20 } },
      React.createElement("pre", { style: { margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-wrap" } },
        "Thanks for the rate-limiter work — the middleware approach is clean. Two blockers before this can merge:\n\n1. **src/config.ts:12** — a live Stripe key (sk_live_…) is committed. Rotate it and move to env.\n2. **src/api/public/webhooks.ts:61** — request-controlled callback_url with the account token attached is an SSRF/exfil path.\n\nOne non-blocking note: the 429 branch is missing the Retry-After header listed in the PR's own scope.")),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 } },
      React.createElement(window.Toggle, { on: true, onChange: () => {}, size: 16 }),
      React.createElement("span", { style: { fontSize: 13, color: "var(--text-secondary)" } }, "Include inline comments (",  React.createElement("span", { className: "tnum" }, accepted.length), " file:line comments)")),
    React.createElement(window.SectionLabel, { icon: "GitMerge" }, "Verdict"),
    React.createElement("div", { style: { display: "flex", gap: 8 } },
      [["Approve", "ok"], ["Request changes", "crit"], ["Comment", "info"]].map(([l, c], i) =>
        React.createElement("label", { key: l, style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
          border: "1.5px solid " + (i === 1 ? "var(--crit)" : "var(--border)"), background: i === 1 ? "var(--crit-bg)" : "var(--bg-elevated)", color: i === 1 ? "var(--crit)" : "var(--text-secondary)" } },
          React.createElement("span", { style: { width: 14, height: 14, borderRadius: 99, border: "1.5px solid " + (i === 1 ? "var(--crit)" : "var(--border-strong)"), display: "grid", placeItems: "center" } }, i === 1 && React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: "var(--crit)" } })), l))));
}

function PRHeader({ onCompose }) {
  const P = window.PR;
  return React.createElement("div", { style: { position: "sticky", top: 0, zIndex: 5, background: "var(--bg-primary)", borderBottom: "1px solid var(--border)", padding: "16px 28px 14px" } },
    React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 16 } },
      React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        React.createElement("h1", { style: { fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 } },
          React.createElement("span", { className: "mono", style: { fontSize: 16, color: "var(--text-muted)", fontWeight: 500 } }, "#" + P.number), P.title),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginTop: 9, fontSize: 12.5, color: "var(--text-secondary)", flexWrap: "wrap" } },
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, React.createElement(window.Avatar, { name: P.author, size: 17 }), P.author),
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 } }, React.createElement(window.Icon.GitBranch, { size: 13, style: { color: "var(--text-muted)" } }), React.createElement("span", { className: "mono", style: { fontSize: 11.5 } }, P.branch), React.createElement(window.Icon.ArrowRight, { size: 11 }), React.createElement("span", { className: "mono", style: { fontSize: 11.5 } }, P.base)),
          React.createElement("span", { className: "mono tnum" }, React.createElement("span", { style: { color: "var(--code-add-text)" } }, "+" + P.additions), " ", React.createElement("span", { style: { color: "var(--code-del-text)" } }, "−" + P.deletions)),
          React.createElement("span", null, "opened " + P.openedAgo),
          React.createElement(window.Badge, { color: "var(--warn)", bg: "var(--warn-bg)", dot: true }, "Needs review")),
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, flexShrink: 0 } },
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "ExternalLink" }, "View on GitHub"),
        React.createElement(window.RunReviewDropdown, { kind: "secondary", size: "sm" }),
        React.createElement(window.Dropdown, { width: 220, align: "right",
          trigger: React.createElement(window.Button, { kind: "primary", size: "sm", icon: "MessageSquare", iconRight: "ChevronDown" }, "Compose review"),
          items: [{ label: "Compose from findings", icon: "ListChecks", onClick: onCompose }, { label: "Compose blank review", icon: "Edit", onClick: onCompose }] }))));
}

function OverviewTab({ blastView, onGoto, briefState }) {
  return React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 1080, margin: "0 auto" } },
    React.createElement("section", null,
      React.createElement(window.SectionLabel, { icon: "FileText" }, "PR Brief"),
      React.createElement(BriefCard, { blastView, onGoto, briefState })));
}

function FilesTab({ navTarget }) {
  return React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 1080, margin: "0 auto" } },
    React.createElement(window.SectionLabel, { icon: "Code" }, "Reviewer-ordered diff"),
    React.createElement(window.SmartDiff, { navTarget }));
}

function NavToast({ msg }) {
  return React.createElement("div", { style: { position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 40,
    display: "flex", alignItems: "center", gap: 8, padding: "10px 15px", borderRadius: 9, fontSize: 12.5, fontWeight: 500,
    background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)", boxShadow: "0 10px 34px rgba(0,0,0,.34)", animation: "ddpop .2s ease" } },
    React.createElement(window.Icon.AlertTriangle, { size: 14, style: { color: "var(--warn)" } }), msg);
}

function ScreenPRDetail({ blastView, h = 1100, composeOpen, tab = "overview", briefState }) {
  const [compose, setCompose] = React.useState(!!composeOpen);
  const [t, setT] = React.useState(tab);
  const [navTarget, setNavTarget] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => setT(tab), [tab]);

  const goto = (file, line) => {
    const exists = window.DIFF.groups.some((g) => g.files.some((f) => f.path === file));
    if (!exists) {
      setToast("File not in this PR's diff");
      clearTimeout(window.__ddToastT);
      window.__ddToastT = setTimeout(() => setToast(null), 2600);
      return;
    }
    setT("files");
    setNavTarget({ file, line, nonce: Date.now() });
  };

  return React.createElement(window.AppFrame, { active: "dashboard", h, crumb: [{ label: "acme/payments-api", mono: true }, { label: "Pull Requests" }, { label: "#482", mono: true }] },
    React.createElement("div", { style: { position: "relative", display: "flex", flexDirection: "column", minHeight: 0, height: "100%" } },
      compose && React.createElement(ComposeReviewDrawer, { onClose: () => setCompose(false) }),
      React.createElement(PRHeader, { onCompose: () => setCompose(true) }),
      React.createElement("div", { style: { background: "var(--bg-primary)", borderBottom: "1px solid var(--border)", flexShrink: 0 } },
        React.createElement(window.Tabs, { pad: "0 28px", value: t, onChange: setT, tabs: [
          { key: "overview", label: "Overview", icon: "FileText" },
          { key: "runs", label: "Agent runs", icon: "Activity", count: 7 },
          { key: "files", label: "Files changed", icon: "Code", count: 9 },
        ] })),
      React.createElement("div", { style: { overflowY: "auto", maxHeight: Math.max(380, h - 188) } },
        t === "overview" && React.createElement(OverviewTab, { blastView, onGoto: goto, briefState }),
        t === "runs" && React.createElement(window.AgentRunsTab),
        t === "files" && React.createElement(FilesTab, { navTarget })),
      toast && React.createElement(NavToast, { msg: toast })));
}

Object.assign(window, { ScreenPRDetail, BriefCard, IntentBlock, RiskPillRow, ReviewFocusBlock, HistoryAccordion, ComposeReviewDrawer });
