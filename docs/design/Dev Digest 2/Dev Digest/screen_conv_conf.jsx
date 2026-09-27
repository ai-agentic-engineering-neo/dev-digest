/* screen_conv_conf.jsx — N7 Conventions extractor + N8 Conformance Report */

// convention → editable draft skill (body is the only thing sent to the model)
function slugifyRule(rule) {
  const stop = ["always", "use", "the", "a", "an", "to", "of", "instead", "must", "should", "all", "in", "via", "through", "are", "is", "and", "with", "for"];
  return rule.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .split("-").filter((w) => w && !stop.includes(w)).slice(0, 4).join("-");
}
function conventionsToDraft(list) {
  const single = list.length === 1;
  const name = single ? slugifyRule(list[0].rule) : "payments-api-conventions";
  const description = single ? list[0].rule : list.length + " house conventions extracted from payments-api";
  const sections = list.map((c) => "## " + slugifyRule(c.rule) + "\n" + c.rule + ".\n\nDetected in `" + c.evidence_path + "`:\n\n```\n" + c.evidence_snippet + "\n```").join("\n\n");
  const body = "# " + name + "\n\nHouse conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.\n\n" + sections;
  return { name, description, type: "convention", enabled: true, body, count: list.length };
}

function CreateSkillModal({ draft, onClose }) {
  const d = draft;
  const footer = React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
    React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)", marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 6 } },
      React.createElement(window.Icon.GitCommit, { size: 13 }), "Saved as ", React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)" } }, "v1"), " · added to Skills Lab"),
    React.createElement(window.Button, { kind: "ghost", onClick: onClose }, "Cancel"),
    React.createElement(window.Button, { kind: "primary", icon: "Sparkles" }, "Create skill"));
  return React.createElement(window.Modal, { width: 760, title: "Create skill from conventions", subtitle: d.name, onClose, footer },
    React.createElement("div", { style: { padding: "18px 22px 8px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 8, background: "var(--accent-bg)", border: "1px solid var(--border)", marginBottom: 18 } },
        React.createElement(window.Icon.Wrench, { size: 15, style: { color: "var(--accent)", flexShrink: 0 } }),
        React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-secondary)" } },
          "Merged from ", React.createElement("b", { style: { color: "var(--text-primary)" } }, d.count + " accepted convention" + (d.count === 1 ? "" : "s")),
          " in ", React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, "payments-api"), ". Everything below is editable before you save.")),
      React.createElement(window.FormField, { label: "Name", required: true }, React.createElement(window.TextInput, { value: d.name, mono: true })),
      React.createElement(window.FormField, { label: "Description" }, React.createElement(window.TextInput, { value: d.description })),
      React.createElement("div", { style: { display: "flex", gap: 14 } },
        React.createElement("div", { style: { flex: 1 } }, React.createElement(window.FormField, { label: "Type" }, React.createElement(window.SelectInput, { value: d.type, options: ["rubric", "convention", "security", "custom"] }))),
        React.createElement("div", { style: { flex: 1 } }, React.createElement(window.FormField, { label: "Enabled", hint: "Whether this block is added to agents' prompts." },
          React.createElement("div", { style: { display: "flex", alignItems: "center", height: 36 } }, React.createElement(window.Toggle, { on: d.enabled, onChange: () => {}, size: 17 }))))),
      React.createElement(window.FormField, { label: "Skill body", required: true, hint: "The only text sent to the model. Merged from the accepted rules + evidence — edit freely." },
        React.createElement(window.CodeEditor, { code: d.body, filename: d.name + ".md" }))));
}

function ConventionCard({ c, accepted, onToggle }) {
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderLeft: "3px solid " + (accepted ? "var(--ok)" : "var(--border)"), borderRadius: 9, background: "var(--bg-elevated)", padding: 16, marginBottom: 12, transition: "border-color .12s" } },
    React.createElement("div", { style: { display: "flex", gap: 14 } },
      React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        React.createElement("div", { style: { fontSize: 14, fontWeight: 600, fontStyle: "italic", lineHeight: 1.4 } }, c.rule),
        React.createElement("div", { style: { marginTop: 10, borderRadius: 7, border: "1px solid var(--border)", overflow: "hidden" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" } },
            React.createElement(window.MonoLink, null, c.evidence_path),
            React.createElement(window.Icon.Copy, { size: 12, style: { color: "var(--text-muted)", cursor: "pointer" } })),
          React.createElement("pre", { className: "mono", style: { margin: 0, padding: "10px 12px", fontSize: 11.5, lineHeight: 1.55, color: "var(--text-primary)", background: "var(--code-bg)", overflow: "auto" } }, c.evidence_snippet)),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } },
          React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, "Confidence"),
          React.createElement("div", { style: { width: 90 } }, React.createElement(window.ProgressBar, { value: c.confidence * 100, height: 5, color: c.confidence >= 0.85 ? "var(--ok)" : "var(--warn)" })),
          React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-secondary)" } }, Math.round(c.confidence * 100) + "%"))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7, flexShrink: 0, width: 150 } },
        accepted
          ? React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Check", full: true, onClick: onToggle }, "Accepted")
          : React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Plus", full: true, onClick: onToggle }, "Accept"),
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "X", full: true }, "Reject"))));
}

function ScreenConventions({ h = 760, empty, createOpen }) {
  const [accepted, setAccepted] = React.useState(() => { const m = {}; window.CONVENTIONS.forEach((c) => { m[c.id] = true; }); return m; });
  const [create, setCreate] = React.useState(!!createOpen);
  const acceptedList = window.CONVENTIONS.filter((c) => accepted[c.id]);
  const allOn = acceptedList.length === window.CONVENTIONS.length;
  const toggle = (id) => setAccepted((s) => ({ ...s, [id]: !s[id] }));
  const setAll = (v) => { const m = {}; window.CONVENTIONS.forEach((c) => { m[c.id] = v; }); setAccepted(m); };
  if (empty) return React.createElement(window.AppFrame, { active: "conventions", h, crumb: [{ label: "Skills Lab" }, { label: "Conventions" }] },
    React.createElement(window.EmptyState, { icon: "ListChecks", title: "No conventions extracted yet", body: "Scan the repo to surface house-rules — naming, error handling, structure — each backed by evidence you can turn into a Skill.", cta: "Run extraction" }));
  return React.createElement(window.AppFrame, { active: "conventions", h, crumb: [{ label: "Skills Lab" }, { label: "Conventions" }] },
    create && acceptedList.length > 0 && React.createElement(CreateSkillModal, { draft: conventionsToDraft(acceptedList), onClose: () => setCreate(false) }),
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 880, margin: "0 auto" } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 } },
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Conventions in ", React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, "payments-api")),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Detected from 84 sample files · last scan 1h ago")),
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "RefreshCw" }, "Re-scan")),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: allOn ? "X" : "Check", onClick: () => setAll(!allOn) }, allOn ? "Deselect all" : "Accept all"),
        React.createElement("span", { style: { fontSize: 12, color: "var(--text-muted)" } }, acceptedList.length + " of " + window.CONVENTIONS.length + " accepted"),
        React.createElement("div", { style: { marginLeft: "auto" } },
          React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Sparkles", onClick: () => acceptedList.length && setCreate(true), style: acceptedList.length ? undefined : { opacity: 0.5 } }, "Create skill"))),
      window.CONVENTIONS.map((c) => React.createElement(ConventionCard, { key: c.id, c, accepted: !!accepted[c.id], onToggle: () => toggle(c.id) }))));
}

/* ---- N8 Conformance Report ---- */
const CONFORMANCE = {
  spec: "rate-limiting.prd.md", completeness: 78,
  implemented: [
    { req: "All public endpoints must be rate-limited", ev: "src/middleware/ratelimit.ts:25", note: "Token-bucket limiter applied to /api/public/*" },
    { req: "Limiter backed by Redis for multi-instance", ev: "src/middleware/ratelimit.ts:27", note: "Uses redis.incr per bucket key" },
    { req: "Per-client-IP bucketing", ev: "src/middleware/ratelimit.ts:41", note: "bucketKey() derives from req.ip" },
  ],
  missing: [
    { req: "429 responses must include Retry-After header", where: "Expected in the 429 branch at ratelimit.ts:52 — only status is set" },
    { req: "Buckets reset on a schedule", where: "No cron found; spec calls for hourly reset job" },
  ],
  creep: [
    { code: "Webhook callback_url forwarding", ev: "src/api/public/webhooks.ts:61", note: "Not tied to any rate-limiting requirement — and flagged as SSRF risk" },
  ],
};

function ConfCard({ title, note, ev, where, color }) {
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderLeft: "3px solid " + color, borderRadius: 8, background: "var(--bg-elevated)", padding: 13, marginBottom: 10 } },
    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 } }, title),
    (note || where) && React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 } }, note || where),
    ev && React.createElement("div", { style: { marginTop: 8 } }, React.createElement(window.MonoLink, null, ev)));
}

function ConfColumn({ icon, label, color, count, items, render }) {
  return React.createElement("div", { style: { flex: 1, minWidth: 0 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, background: color + "1a", marginBottom: 12 } },
      React.createElement(window.Icon[icon], { size: 15, style: { color } }),
      React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color } }, label),
      React.createElement("span", { className: "tnum", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color } }, count)),
    items.map(render));
}

function ScreenConformance({ h = 820, empty }) {
  if (empty) return React.createElement(window.AppFrame, { active: "context", h, crumb: [{ label: "Conformance" }] },
    React.createElement(window.EmptyState, { icon: "ListChecks", title: "Add a spec to compare against", body: "Pick a PRD from Project Context and DevDigest checks the PR against each requirement.", cta: "Choose a spec" }));
  const C = CONFORMANCE;
  return React.createElement(window.AppFrame, { active: "context", h, crumb: [{ label: "Conformance" }, { label: "#482", mono: true }] },
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 1040, margin: "0 auto" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 22 } },
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("h1", { style: { fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" } }, "PRD: Rate Limiting"),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Comparing PR ", React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, "#482"), " against ", React.createElement("span", { className: "mono" }, C.spec))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } },
          React.createElement(window.CircularScore, { score: C.completeness, size: 60, stroke: 6 }),
          React.createElement("span", { style: { fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "0.04em" } }, "COMPLETE")),
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "RefreshCw" }, "Re-run check")),
      React.createElement("div", { style: { display: "flex", gap: 18 } },
        React.createElement(ConfColumn, { icon: "CheckCircle", label: "Implemented", color: "#10b981", count: C.implemented.length, items: C.implemented,
          render: (it, i) => React.createElement(ConfCard, { key: i, title: it.req, note: it.note, ev: it.ev, color: "#10b981" }) }),
        React.createElement(ConfColumn, { icon: "AlertTriangle", label: "Missing", color: "#f59e0b", count: C.missing.length, items: C.missing,
          render: (it, i) => React.createElement(ConfCard, { key: i, title: it.req, where: it.where, color: "#f59e0b" }) }),
        React.createElement(ConfColumn, { icon: "Plus", label: "Scope creep", color: "#999999", count: C.creep.length, items: C.creep,
          render: (it, i) => React.createElement(ConfCard, { key: i, title: it.code, note: it.note, ev: it.ev, color: "#999999" }) }))));
}

Object.assign(window, { ScreenConventions, ScreenConformance });
