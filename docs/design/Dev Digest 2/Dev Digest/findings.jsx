/* findings.jsx — FindingCard (+ trifecta & secret variants), FindingList, VerdictBanner */

function TrifectaVenn({ components }) {
  // three overlapping circles; all three "caught" => filled center
  const labels = { private_data_access: "Private data", untrusted_input: "Untrusted input", exfil_path: "Exfil path" };
  const positions = [{ cx: 34, cy: 26 }, { cx: 56, cy: 26 }, { cx: 45, cy: 44 }];
  const keys = ["private_data_access", "untrusted_input", "exfil_path"];
  return React.createElement("div", { style: { display: "flex", gap: 14, alignItems: "center", padding: "10px 12px", background: "var(--crit-bg)", borderRadius: 7, border: "1px solid rgba(239,68,68,0.25)" } },
    React.createElement("svg", { width: 90, height: 70, style: { flexShrink: 0 } },
      keys.map((k, i) => React.createElement("circle", { key: k, cx: positions[i].cx, cy: positions[i].cy, r: 18, fill: components.includes(k) ? "rgba(239,68,68,0.22)" : "transparent", stroke: components.includes(k) ? "var(--crit)" : "var(--border-strong)", strokeWidth: 1.5 })),
      React.createElement("circle", { cx: 45, cy: 32, r: 4, fill: "var(--crit)" })),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--crit)", letterSpacing: "0.04em" } }, "LETHAL TRIFECTA — ALL 3 PRESENT"),
      keys.map((k) => React.createElement("div", { key: k, style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-secondary)" } },
        React.createElement(window.Icon.Check, { size: 12, style: { color: "var(--crit)" } }),
        labels[k]))));
}

function ActionRow({ onAccept, onDismiss, onEval, status }) {
  return React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" } },
    React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Check", onClick: onAccept }, "Accept"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "X", onClick: onDismiss }, "Dismiss"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Brain" }, "Learn"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "FlaskConical", onClick: onEval,
      title: status === "dismissed" ? "Create a 'must NOT comment' eval case from this dismissal" : "Create a 'must find' eval case from this finding" }, "Turn into eval case"),
    React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "MessageSquare" }, "Reply to author"));
}

// build an eval-case seed from a finding + its disposition
function findingToSeed(f, status) {
  const dismissed = status === "dismissed";
  const lineRange = f.start_line === f.end_line ? String(f.start_line) : f.start_line + "-" + f.end_line;
  const slug = (f.title || "finding").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34);
  return {
    direction: dismissed ? "negative" : "positive",
    name: (dismissed ? "no-" : "must-find-") + slug,
    file: f.file, line: f.start_line, lineRange,
    title: f.title, severity: f.severity, category: f.category,
    assertion: dismissed
      ? "MUST NOT comment on " + f.file + ":" + lineRange + " (" + f.title + ")"
      : "MUST find \u201C" + f.title + "\u201D at " + f.file + ":" + lineRange,
    expected: dismissed
      ? "[]  // dismissed \u2014 agent must produce no finding here"
      : JSON.stringify([{ severity: f.severity, category: f.category, title: f.title, file: f.file, start_line: f.start_line }], null, 2),
  };
}

function CodeBlock({ children, label }) {
  return React.createElement("div", { style: { borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", marginTop: 8 } },
    label && React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" } },
      React.createElement("span", null, label),
      React.createElement(window.Icon.Copy, { size: 12, style: { cursor: "pointer" } })),
    React.createElement("pre", { className: "mono", style: { margin: 0, padding: "10px 12px", fontSize: 12, lineHeight: 1.6, background: "var(--bg-surface)", overflowX: "auto", color: "var(--text-primary)" } }, children));
}

const FINDING_STATUS_META = {
  open:      { c: "var(--text-muted)", bg: "transparent", icon: "Dot", label: "Open" },
  accepted:  { c: "var(--ok)", bg: "var(--ok-bg)", icon: "Check", label: "Accepted" },
  dismissed: { c: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X", label: "Dismissed" },
};

function FindingCard({ f, idx, focused, status }) {
  const [expanded, setExpanded] = React.useState(idx === 0);
  const [st, setSt] = React.useState(status || "open");
  const [evalSeed, setEvalSeed] = React.useState(null);
  React.useEffect(() => { if (status) setSt(status); }, [status]);
  const accepted = st === "accepted";
  const dismissed = st === "dismissed";
  const dim = accepted || dismissed;
  const sm = FINDING_STATUS_META[st];
  const s = window.SEV[f.severity];
  return React.createElement("div", {
    style: {
      borderRadius: 8, border: "1px solid " + (focused ? s.c : "var(--border)"),
      borderLeft: "3px solid " + (dismissed ? "var(--border-strong)" : s.c), background: "var(--bg-elevated)", overflow: "hidden",
      opacity: dim ? 0.6 : 1, transition: "opacity .2s, border-color .12s",
      boxShadow: focused ? "0 0 0 1px " + s.c : "none",
    },
  },
    React.createElement("div", { onClick: () => setExpanded((e) => !e), style: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", cursor: "pointer" } },
      React.createElement("div", { style: { paddingTop: 1 } }, React.createElement(window.SeverityBadge, { severity: f.severity, compact: true })),
      React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
          React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600, color: dim ? "var(--text-muted)" : "var(--text-primary)", textDecoration: accepted ? "line-through" : "none" } }, f.title),
          React.createElement(window.CategoryTag, { category: f.category }),
          st !== "open" && React.createElement(window.Badge, { color: sm.c, bg: sm.bg, icon: sm.icon }, sm.label)),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } },
          React.createElement(window.MonoLink, null, f.file + ":" + (f.start_line === f.end_line ? f.start_line : f.start_line + "-" + f.end_line)),
          React.createElement(window.ConfidenceNum, { value: f.confidence }))),
      React.createElement(window.Icon.ChevronDown, { size: 16, style: { color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", marginTop: 2, flexShrink: 0 } })),
    expanded && React.createElement("div", { style: { padding: "0 14px 14px", borderTop: "1px solid var(--border)", marginTop: 0, paddingTop: 12 } },
      f.kind === "lethal_trifecta" && React.createElement("div", { style: { marginBottom: 12 } }, React.createElement(TrifectaVenn, { components: f.trifecta_components })),
      React.createElement("div", { style: { fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" } }, window.mdLite(f.rationale)),
      f.suggestion && React.createElement("div", { style: { marginTop: 12 } },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" } }, "Suggested fix"),
        React.createElement("div", { style: { fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" } }, window.mdLite(f.suggestion))),
      React.createElement(ActionRow, { status: st, onAccept: () => setSt("accepted"), onDismiss: () => setSt("dismissed"), onEval: () => setEvalSeed(findingToSeed(f, st)) }),
      evalSeed && window.EvalCaseEditor && React.createElement(window.EvalCaseEditor, { seed: evalSeed, onClose: () => setEvalSeed(null) })));
}

function VerdictBanner({ onRegenerate, loading } = {}) {
  const V = window.VERDICT;
  const map = {
    request_changes: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle", label: "Request changes" },
    approve: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", label: "Approve" },
    comment: { c: "var(--info)", bg: "var(--info-bg)", icon: "MessageSquare", label: "Comment" },
  };
  const m = map[V.verdict];
  const provenance = "Verdict, findings and score come from the latest agent review; what / why / risks / review-focus come from the brief.";
  return React.createElement("div", { style: { display: "flex", gap: 16, alignItems: "flex-start", padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
    React.createElement("div", { style: { width: 40, height: 40, borderRadius: 9, display: "grid", placeItems: "center", background: m.bg, color: m.c, flexShrink: 0 } },
      React.createElement(window.Icon[m.icon], { size: 22 })),
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("span", { style: { fontSize: 16, fontWeight: 700, color: m.c } }, m.label),
        React.createElement(window.Badge, { color: "var(--text-secondary)" }, "6 findings · 2 blockers"),
        React.createElement("span", { title: provenance, style: { display: "inline-flex", cursor: "help", color: "var(--text-muted)" } },
          React.createElement(window.Icon.Info, { size: 13 }))),
      React.createElement("p", { style: { fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)", marginTop: 6, textWrap: "pretty" } }, V.summary)),
    onRegenerate && React.createElement("div", { style: { flexShrink: 0 } },
      React.createElement(window.IconBtn, { icon: "RefreshCw", label: "Re-run the brief for this PR", onClick: onRegenerate })),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 } },
      loading
        ? React.createElement("div", { style: { width: 52, height: 52, display: "grid", placeItems: "center" } },
            React.createElement(window.Icon.RefreshCw, { size: 24, style: { color: "var(--accent)", animation: "ddspin 0.8s linear infinite" } }))
        : React.createElement(window.CircularScore, { score: V.score, size: 52, stroke: 5 }),
      React.createElement("span", { style: { fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "0.04em" } }, "PR SCORE"),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, marginTop: 5, paddingTop: 6, borderTop: "1px solid var(--border)" } },
        React.createElement(window.Icon.DollarSign, { size: 11, style: { color: "var(--text-muted)" } }),
        React.createElement(window.CostBadge, { usd: V.cost, tokens: (V.tokens_in / 1000).toFixed(1) + "K→" + (V.tokens_out / 1000).toFixed(1) + "K" }))));
}

function FindingsPanel() {
  const F = window.FINDINGS;
  const order = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2, INFO: 3 };
  const [sevFilter, setSevFilter] = React.useState({ CRITICAL: true, WARNING: true, SUGGESTION: true });
  const [hideLow, setHideLow] = React.useState(false);
  const counts = F.reduce((a, f) => (a[f.severity] = (a[f.severity] || 0) + 1, a), {});
  let shown = F.filter((f) => sevFilter[f.severity]);
  if (hideLow) shown = shown.filter((f) => f.confidence >= 0.65);
  shown = [...shown].sort((a, b) => order[a.severity] - order[b.severity]);
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" } },
      ["CRITICAL", "WARNING", "SUGGESTION"].map((sv) => React.createElement(Chip, {
        key: sv, active: sevFilter[sv], onClick: () => setSevFilter((s) => ({ ...s, [sv]: !s[sv] })),
        icon: window.SEV[sv].icon, count: counts[sv] || 0, color: window.SEV[sv].c,
      }, window.SEV[sv].label)),
      React.createElement("div", { style: { width: 1, height: 18, background: "var(--border)", margin: "0 2px" } }),
      React.createElement(Chip, { icon: "Tag" }, "All categories"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" } },
        "Hide low confidence", React.createElement(window.Toggle, { on: hideLow, onChange: setHideLow, size: 16 }))),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
      shown.length === 0 ? React.createElement(window.EmptyState, { icon: "Filter", title: "No findings match", body: "Adjust the filters above to see findings." })
        : shown.map((f, i) => React.createElement(FindingCard, { key: f.id, f, idx: i, focused: i === 0 }))));
}

const { Chip } = window;
Object.assign(window, { FindingCard, FindingsPanel, VerdictBanner, TrifectaVenn, CodeBlock, FINDING_STATUS_META });
