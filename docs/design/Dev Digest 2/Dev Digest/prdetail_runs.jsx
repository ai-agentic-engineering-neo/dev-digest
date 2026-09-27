/* prdetail_runs.jsx — Agent runs tab: Timeline (runs + commits) + Review Runs (expandable) */

// run disposition in the timeline
const RUN_STATUS = {
  reviewed:  { c: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare", label: "reviewed" },
  rejected:  { c: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle", label: "rejected" },
  approved:  { c: "var(--ok)",   bg: "var(--ok-bg)",   icon: "CheckCircle", label: "approved" },
  error:     { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon", label: "error" },
};
// the AI's verdict, shown inside a review-run card
const VERDICT_META = {
  request_changes: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle", label: "Request changes" },
  approve:         { c: "var(--ok)",   bg: "var(--ok-bg)",   icon: "CheckCircle", label: "Approve" },
  comment:         { c: "var(--info)", bg: "var(--info-bg)", icon: "MessageSquare", label: "Comment" },
};

function ReviewRunData() {
  const F = window.FINDINGS;
  return [
    { id: "rr-sec", agent: "Security Reviewer", model: "openrouter/deepseek-v4-flash", verdict: "request_changes", score: 38, blockers: 2, time: "6/13/2026, 8:52:51 PM", cost: 0.0013, tokens_in: 9119, tokens_out: 1240, summary: "Two critical exposures: a committed live Stripe key and an SSRF-shaped webhook forwarder. Block before merge.", findings: [F[0], F[1], F[3]] },
    { id: "rr-perf", agent: "Performance Reviewer", model: "openrouter/deepseek-v4-flash", verdict: "comment", score: 64, blockers: 0, time: "6/13/2026, 8:52:14 PM", cost: 0.0014, tokens_in: 12011, tokens_out: 980, summary: "N+1 in the user list will bite under the new limiter. The Redis round-trip is acceptable.", findings: [F[2], F[4]] },
  ];
}

function TimelineData() {
  const F = window.FINDINGS;
  return [
    { type: "run", status: "reviewed", score: 38, agent: "Security Reviewer", model: "openrouter/deepseek-v4-flash", findings: 3, items: [F[0], F[1], F[3]], blockers: 2, time: "8:52:51 PM", tokens: 9119, cost: 0.0013 },
    { type: "run", status: "reviewed", score: 64, agent: "Performance Reviewer", model: "openrouter/deepseek-v4-flash", findings: 2, items: [F[2], F[4]], blockers: 0, time: "8:52:14 PM", tokens: 12011, cost: 0.0014 },
    { type: "run", status: "error", agent: "General Reviewer", model: "openai/gpt-4.1", error: "429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://…", time: "8:52:14 PM" },
    { type: "commit", hash: "e694ac8", msg: "fix(ci): correct PR-review posting — deterministic verdict, diff-anchored comments", author: "marisa.koch", time: "1:08:27 AM" },
    { type: "run", status: "rejected", score: 0, agent: "Performance Reviewer", model: "openrouter/deepseek-v4-flash", findings: 5, items: [F[0], F[1], F[2], F[3], F[5]], blockers: 2, time: "3:20:16 PM", tokens: 8457, cost: 0.0012 },
    { type: "commit", hash: "5f01c7e", msg: "feat: add rate-limiter middleware + Redis token bucket", author: "marisa.koch", time: "12:26:26 AM" },
    { type: "commit", hash: "2ba3303", msg: "initial commit: public API namespace", author: "deepak.r", time: "12:02:44 AM" },
  ];
}

function FindingsTooltip({ items, placement = "down", width = 380 }) {
  const stripMd = (s) => (s || "").replace(/\*\*|`/g, "");
  const pos = placement === "up" ? { bottom: "100%", marginBottom: 8 } : { top: "100%", marginTop: 8 };
  return React.createElement("div", { style: { position: "absolute", left: 0, ...pos, zIndex: 30, width, background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: 10, boxShadow: "var(--shadow-modal)", padding: 12, animation: "ddpop .12s ease", cursor: "default", textAlign: "left" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 9 } },
      React.createElement(window.Icon.AlertOctagon, { size: 12 }), items.length + " findings"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 9, maxHeight: 300, overflow: "auto" } },
      items.map((f, i) => React.createElement("div", { key: i, style: { paddingBottom: i < items.length - 1 ? 9 : 0, borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" } },
          React.createElement(window.SeverityBadge, { severity: f.severity, compact: true }),
          React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } }, f.title),
          React.createElement(window.CategoryTag, { category: f.category })),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, margin: "5px 0 0" } },
          React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--accent-text)" } }, f.file + ":" + (f.start_line === f.end_line ? f.start_line : f.start_line + "-" + f.end_line)),
          React.createElement(window.ConfidenceNum, { value: f.confidence })),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.45, marginTop: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, stripMd(f.rationale))))));
}

function RunFindings({ r }) {
  const [show, setShow] = React.useState(false);
  const items = r.items || [];
  const counts = {};
  items.forEach((f) => { counts[f.severity] = (counts[f.severity] || 0) + 1; });
  return React.createElement("div", {
    onMouseEnter: () => setShow(true), onMouseLeave: () => setShow(false),
    style: { position: "relative", display: "inline-flex", alignItems: "center", gap: 10, marginTop: 5, width: "fit-content", cursor: "help" },
  },
    ["CRITICAL", "WARNING", "SUGGESTION"].filter((sv) => counts[sv]).map((sv) => {
      const s = window.SEV[sv];
      return React.createElement("span", { key: sv, style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: s.c, borderBottom: "1px dotted " + s.c, paddingBottom: 1 } },
        React.createElement(window.Icon[s.icon], { size: 12.5 }), React.createElement("span", { className: "tnum" }, counts[sv]));
    }),
    r.blockers ? React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, "· " + r.blockers + " blockers") : null,
    show && items.length > 0 && React.createElement(FindingsTooltip, { items }));
}

function TimelineRun({ r, onOpen }) {
  const s = RUN_STATUS[r.status];
  const [h, setH] = React.useState(false);
  return React.createElement("div", { onClick: onOpen, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 9, border: "1px solid " + (h ? "var(--border-strong)" : "var(--border)"), background: h ? "var(--bg-hover)" : "var(--bg-elevated)", cursor: "pointer", transition: "background .1s, border-color .1s" } },
    React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: s.c, background: s.bg, flexShrink: 0 } },
      React.createElement(window.Icon[s.icon], { size: 13 }), s.label),
    r.status !== "error" && React.createElement(window.CircularScore, { score: r.score, size: 32, stroke: 3.5 }),
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
        React.createElement(window.MonoLink, null, r.agent),
        React.createElement("span", { className: "mono", style: { fontSize: 11.5, color: "var(--text-muted)" } }, r.model)),
      r.error
        ? React.createElement("div", { style: { fontSize: 12, color: "var(--crit)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, r.error)
        : React.createElement(RunFindings, { r })),
    React.createElement("div", { style: { textAlign: "right", flexShrink: 0 } },
      React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, r.time),
      !r.error && React.createElement("div", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-secondary)", marginTop: 3 } }, r.tokens.toLocaleString() + " tok · $" + r.cost.toFixed(4))),
    React.createElement("div", { style: { display: "flex", gap: 2, flexShrink: 0 }, onClick: (e) => e.stopPropagation() },
      React.createElement(window.IconBtn, { icon: "Copy", label: "Copy", size: 26 }),
      React.createElement(window.IconBtn, { icon: "Trash", label: "Delete", size: 26, danger: true })));
}

function TimelineCommit({ c }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", borderRadius: 8, border: "1px dashed var(--border)", background: "transparent" } },
    React.createElement(window.Icon.GitCommit, { size: 14, style: { color: "var(--text-muted)", flexShrink: 0 } }),
    React.createElement("span", { className: "mono", style: { fontSize: 11.5, color: "var(--accent-text)", flexShrink: 0 } }, c.hash),
    React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-secondary)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, c.msg),
    React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0 } }, c.author),
    React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0 } }, c.time));
}

function Timeline({ onOpenTrace }) {
  const items = TimelineData();
  return React.createElement("section", { style: { marginBottom: 28 } },
    React.createElement(window.SectionLabel, { icon: "Activity", right: React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, "runs & commits · newest first") }, "Timeline"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      items.map((it, i) => it.type === "run" ? React.createElement(TimelineRun, { key: i, r: it, onOpen: onOpenTrace }) : React.createElement(TimelineCommit, { key: i, c: it }))));
}

function ReviewRunCard({ run, defaultOpen, onOpenTrace }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const v = VERDICT_META[run.verdict];
  const shown = run.findings;
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg-elevated)" } },
    React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" } },
      React.createElement("div", { style: { width: 24, height: 24, borderRadius: 6, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(window.Icon.Cpu, { size: 13 })),
      React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600 } }, run.agent),
      React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, color: v.c } }, v.label.toLowerCase()),
      React.createElement("span", { style: { fontSize: 12, color: "var(--text-muted)" } }, run.findings.length + " findings" + (run.blockers ? " · " + run.blockers + " blockers" : "")),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 } },
        React.createElement("span", { className: "tnum", style: { fontSize: 12, fontWeight: 700, color: run.score >= 75 ? "var(--ok)" : run.score >= 50 ? "var(--warn)" : "var(--crit)" } }, run.score),
        React.createElement(window.CostBadge, { usd: run.cost }),
        React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, run.time),
        React.createElement("span", { onClick: (e) => { e.stopPropagation(); onOpenTrace && onOpenTrace(); }, title: "View agent run trace", style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 500, color: "var(--accent-text)", cursor: "pointer" } }, React.createElement(window.Icon.PanelRight, { size: 13 }), "trace"),
        React.createElement(window.IconBtn, { icon: "Trash", label: "Delete", size: 24, danger: true }),
        React.createElement(window.Icon.ChevronDown, { size: 16, style: { color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" } }))),
    open && React.createElement("div", { style: { padding: "0 16px 16px", borderTop: "1px solid var(--border)", paddingTop: 14 } },
      // verdict block
      React.createElement("div", { style: { display: "flex", gap: 14, alignItems: "flex-start", padding: 16, borderRadius: 10, border: "1px solid " + v.c, background: v.bg, marginBottom: 14 } },
        React.createElement("div", { style: { width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--bg-elevated)", color: v.c, flexShrink: 0 } }, React.createElement(window.Icon[v.icon], { size: 20 })),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 15, fontWeight: 700, color: v.c } }, v.label),
            React.createElement("span", { style: { fontSize: 12, color: "var(--text-secondary)" } }, run.findings.length + " findings" + (run.blockers ? " · " + run.blockers + " blockers" : "")),
            React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)", icon: "Cpu" }, run.agent)),
          React.createElement("p", { style: { fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)", marginTop: 7, textWrap: "pretty" } }, run.summary)),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 } },
          React.createElement(window.CircularScore, { score: run.score, size: 46, stroke: 4.5 }),
          React.createElement("span", { style: { fontSize: 9.5, color: "var(--text-muted)", letterSpacing: "0.04em" } }, "PR SCORE"))),
      // finding cards
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        shown.map((f, i) => React.createElement(window.FindingCard, { key: f.id, f, idx: i })))));
}

function ReviewRuns({ onOpenTrace }) {
  const runs = ReviewRunData();
  return React.createElement("section", null,
    React.createElement(window.SectionLabel, { icon: "AlertOctagon", right: React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, "grouped by run · newest first") }, "Review Runs"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
      runs.map((run, i) => React.createElement(ReviewRunCard, { key: run.id, run, defaultOpen: i === 0, onOpenTrace }))));
}

function AgentRunsTab() {
  const [trace, setTrace] = React.useState(false);
  return React.createElement(React.Fragment, null,
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 1080, margin: "0 auto" } },
      React.createElement(Timeline, { onOpenTrace: () => setTrace(true) }),
      React.createElement(ReviewRuns, { onOpenTrace: () => setTrace(true) })),
    trace && React.createElement(window.TraceDrawer, { running: false, onClose: () => setTrace(false) }));
}

Object.assign(window, { AgentRunsTab, Timeline, ReviewRuns, RUN_STATUS, FindingsTooltip });
