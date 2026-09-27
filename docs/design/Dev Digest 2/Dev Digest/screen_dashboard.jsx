/* screen_dashboard.jsx — Repo Dashboard: PR list + filters */

const SIZE_COLOR = { S: "var(--ok)", M: "var(--warn)", L: "var(--crit)" };
const STATUS_META = {
  needs_review: { label: "Needs review", c: "var(--warn)" },
  reviewed: { label: "Reviewed", c: "var(--ok)" },
  stale: { label: "Stale", c: "var(--stale)" },
};

// representative finding pool so each PR's hover tooltip shows real detail matching its counts
const SEV_POOL = {
  CRITICAL: [
    { title: "Hardcoded secret committed", category: "security", file: "src/config.ts", line: 12, confidence: 0.97, rationale: "A literal `sk_live_…` key is committed; rotate it immediately and move to an env var." },
    { title: "SSRF via user-supplied URL", category: "security", file: "src/api/webhooks.ts", line: 73, confidence: 0.8, rationale: "An untrusted `callback_url` drives an outbound request carrying account credentials." },
    { title: "Missing auth check on mutation", category: "security", file: "src/api/admin.ts", line: 21, confidence: 0.84, rationale: "Endpoint mutates state without verifying the caller's role." },
  ],
  WARNING: [
    { title: "N+1 query under load", category: "perf", file: "src/api/users.ts", line: 46, confidence: 0.86, rationale: "A per-row query inside a loop; batch it with a single `IN` clause." },
    { title: "Unhandled promise rejection", category: "bug", file: "src/jobs/worker.ts", line: 34, confidence: 0.78, rationale: "Awaited call lacks try/catch; a throw will crash the worker process." },
    { title: "Migration lacks rollback", category: "bug", file: "db/migrations/0007.sql", line: 1, confidence: 0.81, rationale: "Irreversible migration with no down path — risky to deploy." },
    { title: "Retry-After header omitted", category: "bug", file: "src/middleware/ratelimit.ts", line: 52, confidence: 0.8, rationale: "429 returned without a `Retry-After` header; clients can't back off correctly." },
  ],
  SUGGESTION: [
    { title: "Extract magic number", category: "style", file: "src/util/time.ts", line: 8, confidence: 0.62, rationale: "Unexplained constant repeated twice; give it a named binding." },
    { title: "Add test for error path", category: "test", file: "test/handler.test.ts", line: 1, confidence: 0.7, rationale: "The new branch has no assertions covering its failure case." },
    { title: "Prefer async/await", category: "style", file: "src/lib/fetch.ts", line: 14, confidence: 0.6, rationale: "Replace the `.then()` chain with async/await per the repo house style." },
    { title: "Tighten return type", category: "style", file: "src/api/index.ts", line: 19, confidence: 0.58, rationale: "Return a typed `Result<T>` instead of `any`." },
    { title: "Remove dead import", category: "style", file: "src/app.ts", line: 3, confidence: 0.66, rationale: "The imported symbol is never referenced." },
  ],
};
function prFindings(pr) {
  if (pr.number === 482 && window.FINDINGS) return window.FINDINGS;
  const out = [];
  ["CRITICAL", "WARNING", "SUGGESTION"].forEach((sv) => {
    const n = (pr.findings && pr.findings[sv]) || 0;
    for (let i = 0; i < n; i++) {
      const t = SEV_POOL[sv][i % SEV_POOL[sv].length];
      out.push({ severity: sv, start_line: t.line, end_line: t.line, ...t });
    }
  });
  return out;
}

function FindingsCell({ f, placement }) {
  const [show, setShow] = React.useState(false);
  const counts = [["CRITICAL", f.findings.CRITICAL], ["WARNING", f.findings.WARNING], ["SUGGESTION", f.findings.SUGGESTION]].filter(([, n]) => n > 0);
  if (counts.length === 0) return React.createElement("span", { style: { fontSize: 12, color: "var(--text-muted)" } }, "—");
  const items = prFindings(f);
  return React.createElement("div", {
    onMouseEnter: () => setShow(true), onMouseLeave: () => setShow(false),
    style: { position: "relative", display: "inline-flex", gap: 8, width: "fit-content", cursor: "help" },
  },
    counts.map(([sv, n]) => {
      const s = window.SEV[sv];
      return React.createElement("span", { key: sv, style: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600, color: s.c, borderBottom: "1px dotted " + s.c, paddingBottom: 1 } },
        React.createElement(window.Icon[s.icon], { size: 12 }), React.createElement("span", { className: "tnum" }, n));
    }),
    show && React.createElement(window.FindingsTooltip, { items, placement: placement || "down", width: 360 }));
}

function PRRow({ pr, idx, total }) {
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status];
  const placement = idx >= Math.ceil(total / 2) ? "up" : "down";
  return React.createElement("div", {
    onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: { display: "grid", gridTemplateColumns: "1fr 116px 78px 54px 116px 100px 76px 118px 72px", alignItems: "center", gap: 12,
      padding: "11px 18px", borderBottom: "1px solid var(--border)", cursor: "pointer",
      background: h ? "var(--bg-surface)" : "transparent", transition: "background .1s" },
  },
    React.createElement("div", { style: { minWidth: 0, display: "flex", alignItems: "center", gap: 10 } },
      React.createElement(window.Icon.GitPullRequest, { size: 15, style: { color: st.c, flexShrink: 0 } }),
      React.createElement("div", { style: { minWidth: 0 } },
        React.createElement("div", { style: { fontSize: 13.5, fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: h ? "var(--accent-text)" : "var(--text-primary)" } }, pr.title),
        React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, "#" + pr.number))),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-secondary)" } },
      React.createElement(window.Avatar, { name: pr.author, size: 18 }), pr.author),
    React.createElement("div", null, React.createElement(window.Badge, { color: SIZE_COLOR[pr.size], bg: "transparent", style: { border: "1px solid " + SIZE_COLOR[pr.size] } }, pr.size + " · " + pr.sizeLines)),
    React.createElement("div", { style: { display: "flex", justifyContent: "flex-start" } }, React.createElement(window.CircularScore, { score: pr.score, size: 34, stroke: 3.5 })),
    React.createElement(FindingsCell, { f: pr, placement }),
    React.createElement("div", null, React.createElement(window.Badge, { dot: true, color: st.c, bg: "transparent" }, st.label)),
    React.createElement("div", null, React.createElement(window.CostBadge, { usd: pr.cost })),
    React.createElement("div", { style: { opacity: h ? 1 : 0.55, transition: "opacity .1s" } }, React.createElement(window.RunReviewDropdown, { kind: "ghost", size: "sm" })),
    React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", textAlign: "right" } }, pr.updated));
}

function FilterBar() {
  const [active, setActive] = React.useState("all");
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 11px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", width: 240, color: "var(--text-muted)", fontSize: 12.5 } },
      React.createElement(window.Icon.Search, { size: 14 }), "Filter pull requests…"),
    React.createElement("div", { style: { display: "flex", gap: 6 } },
      [["all", "All"], ["needs_review", "Needs review"], ["reviewed", "Reviewed"], ["stale", "Stale"]].map(([k, l]) =>
        React.createElement(window.Chip, { key: k, active: active === k, onClick: () => setActive(k) }, l))),
    React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } },
      React.createElement(window.Chip, { icon: "ChevronsUpDown" }, "Sort: Newest"),
      React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, "synced 2m ago"),
      React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "RefreshCw" }, "Refresh")));
}

function ScreenDashboard({ h = 760 }) {
  return React.createElement(window.AppFrame, { active: "dashboard", h, crumb: [{ label: "acme/payments-api", mono: true }, { label: "Pull Requests" }] },
    React.createElement("div", { style: { padding: "20px 28px 8px", display: "flex", alignItems: "flex-end", gap: 14 } },
      React.createElement("div", null,
        React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Pull Requests"),
        React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "7 open · 2 need review · reviewer skill ", React.createElement("span", { className: "mono", style: { color: "var(--text-muted)" } }, "v7"))),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } },
        React.createElement(window.AutoTriggerStatus, { on: true }),
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Filter" }, "Triage queue"),
        React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Sparkles" }, "Review all"))),
    React.createElement("div", { style: { margin: "12px 28px 40px", border: "1px solid var(--border)", borderRadius: 10, overflow: "visible", background: "var(--bg-elevated)" } },
      React.createElement(FilterBar),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 116px 78px 54px 116px 100px 76px 118px 72px", gap: 12, padding: "9px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" } },
        ["Pull request", "Author", "Size", "Score", "Findings", "Status", "Cost", "", "Updated"].map((c, i) => React.createElement("div", { key: i, style: { textAlign: i === 8 ? "right" : "left" } }, c))),
      window.PR_LIST.map((pr, i) => React.createElement(PRRow, { key: pr.number, pr, idx: i, total: window.PR_LIST.length }))));
}

Object.assign(window, { ScreenDashboard });
