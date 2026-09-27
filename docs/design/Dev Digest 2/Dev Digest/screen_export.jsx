/* screen_export.jsx — N12 Export to CI Wizard (4 steps, modal) */

const CI_TARGETS = [
  { key: "gha", name: "GitHub Actions", icon: "Workflow", rec: true, desc: "Runs on pull_request events" },
  { key: "circle", name: "CircleCI", icon: "RefreshCw", desc: "config.yml job" },
  { key: "jenkins", name: "Jenkins", icon: "Settings", desc: "Pipeline stage" },
  { key: "cli", name: "Generic CLI", icon: "Command", desc: "devdigest review --pr" },
];

const EXPORT_TREE = [
  { path: ".devdigest/agents/security-reviewer.yaml", sel: true },
  { path: ".devdigest/skills/secret-leakage-gate.md" },
  { path: ".devdigest/skills/lethal-trifecta.md" },
  { path: ".devdigest/memory.jsonl" },
  { path: ".github/workflows/devdigest-review.yml" },
];

const YAML_PREVIEW = `name: DevDigest Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run DevDigest review
        run: node .devdigest/runner.mjs review --agent security-reviewer --pr \${{ github.event.pull_request.number }} --fail-on critical
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`;

function FileTreeRow({ f, active, onClick }) {
  const [h, setH] = React.useState(false);
  return React.createElement("div", { onClick, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: { display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12,
      background: active ? "var(--accent-bg)" : (h ? "var(--bg-hover)" : "transparent") } },
    React.createElement(window.Icon.FileText, { size: 13, style: { color: active ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 } }),
    React.createElement("span", { className: "mono", style: { color: active ? "var(--accent-text)" : "var(--text-secondary)" } }, f.path));
}

function ExportWizard({ onClose }) {
  const [step, setStep] = React.useState(0);
  const [target, setTarget] = React.useState("gha");
  const [selFile, setSelFile] = React.useState(EXPORT_TREE[4].path);
  const labels = ["Target", "Preview", "Configure", "Install"];

  const body = [
    // step 1 — target
    React.createElement("div", { key: 0, style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
      CI_TARGETS.map((t) => React.createElement("button", { key: t.key, onClick: () => setTarget(t.key),
        style: { textAlign: "left", padding: 16, borderRadius: 10, cursor: "pointer", background: "var(--bg-surface)",
          border: "1.5px solid " + (target === t.key ? "var(--accent)" : "var(--border)") } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
          React.createElement("div", { style: { width: 34, height: 34, borderRadius: 8, background: "var(--bg-elevated)", display: "grid", placeItems: "center", color: target === t.key ? "var(--accent)" : "var(--text-secondary)" } }, React.createElement(window.Icon[t.icon], { size: 18 })),
          React.createElement("span", { style: { fontSize: 14, fontWeight: 600 } }, t.name),
          t.rec && React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)", style: { marginLeft: "auto" } }, "recommended")),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } }, t.desc)))),
    // step 2 — preview files
    React.createElement("div", { key: 1, style: { display: "grid", gridTemplateColumns: "260px 1fr", gap: 0, height: 340, border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden" } },
      React.createElement("div", { style: { borderRight: "1px solid var(--border)", padding: 10, background: "var(--bg-surface)", overflow: "auto" } },
        React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", padding: "2px 8px 8px" } }, "FILES TO CREATE"),
        EXPORT_TREE.map((f) => React.createElement(FileTreeRow, { key: f.path, f, active: selFile === f.path, onClick: () => setSelFile(f.path) }))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", minWidth: 0 } },
        React.createElement("div", { style: { padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { className: "mono", style: { fontSize: 12, flex: 1 } }, selFile),
          React.createElement(window.Badge, { color: "var(--text-muted)", icon: "Edit" }, "editable")),
        React.createElement("pre", { className: "mono", style: { margin: 0, padding: 14, fontSize: 11.5, lineHeight: 1.6, overflow: "auto", flex: 1, color: "var(--text-primary)", background: "var(--code-bg)" } }, YAML_PREVIEW))),
    // step 3 — configure
    React.createElement("div", { key: 2, style: { maxWidth: 600 } },
      React.createElement(window.FormField, { label: "Trigger" },
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 7 } },
          ["pull_request:opened", "pull_request:synchronize", "pull_request:reopened"].map((t, i) => React.createElement(window.Chip, { key: i, active: i < 2, icon: i < 2 ? "Check" : null }, t)))),
      React.createElement(window.FormField, { label: "Post results as" },
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7 } },
          [["GitHub review", "recommended", true], ["PR comment", null, false], ["None (exit code only)", null, false]].map((r, i) =>
            React.createElement("label", { key: i, style: { display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" } },
              React.createElement("span", { style: { width: 16, height: 16, borderRadius: 99, border: "1.5px solid " + (r[2] ? "var(--accent)" : "var(--border-strong)"), display: "grid", placeItems: "center" } }, r[2] && React.createElement("span", { style: { width: 8, height: 8, borderRadius: 99, background: "var(--accent)" } })),
              r[0], r[1] && React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--accent-bg)" }, r[1]))))),
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 13px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)" } },
        React.createElement(window.Icon.Info, { size: 15, style: { color: "var(--text-muted)", flexShrink: 0, marginTop: 1 } }),
        React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } },
          "To block merges: set ", React.createElement("span", { style: { fontWeight: 600, color: "var(--text-primary)" } }, "Fail CI on"), " (CI tab) so the run exits non-zero, then add a ", React.createElement("span", { style: { fontWeight: 600, color: "var(--text-primary)" } }, "required status check"), " in the repo\u2019s GitHub branch protection. No GitHub App needed."))),
    // step 4 — install
    React.createElement("div", { key: 3, style: { maxWidth: 600 } },
      React.createElement("button", { style: { width: "100%", textAlign: "left", padding: 18, borderRadius: 10, border: "1.5px solid var(--accent)", background: "var(--accent-bg)", cursor: "pointer", marginBottom: 12 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } },
          React.createElement(window.Icon.GitPullRequest, { size: 18, style: { color: "var(--accent)" } }),
          React.createElement("span", { style: { fontSize: 14, fontWeight: 700 } }, "Open a PR with these files"),
          React.createElement(window.Badge, { color: "var(--accent-text)", bg: "var(--bg-elevated)", style: { marginLeft: "auto" } }, "recommended")),
        React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } }, "DevDigest opens a PR in ", React.createElement("span", { className: "mono" }, "acme/payments-api"), " titled “Add DevDigest CI review” with the 5 generated files.")),
      React.createElement("button", { style: { width: "100%", textAlign: "left", padding: 16, borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", cursor: "pointer" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
          React.createElement(window.Icon.Copy, { size: 16, style: { color: "var(--text-secondary)" } }),
          React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600 } }, "Copy files as a zip"),
          React.createElement("span", { style: { marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" } }, "add them manually"))),
      React.createElement("p", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 14, textAlign: "center" } }, "Need help? See the ", React.createElement("a", { style: { color: "var(--accent-text)" } }, "GitHub Action setup docs →"))),
  ][step];

  return React.createElement(window.Modal, { width: 720, title: "Export to CI", subtitle: "Run Security Reviewer automatically on pull requests", onClose,
    footer: React.createElement("div", { style: { display: "flex", alignItems: "center" } },
      step > 0 && React.createElement(window.Button, { kind: "ghost", icon: "ChevronLeft", onClick: () => setStep((s) => s - 1) }, "Back"),
      React.createElement("div", { style: { marginLeft: "auto" } },
        step < 3 ? React.createElement(window.Button, { kind: "primary", iconRight: "ArrowRight", onClick: () => setStep((s) => s + 1) }, "Continue")
          : React.createElement(window.Button, { kind: "primary", icon: "Check" }, "Install"))) },
    React.createElement("div", { style: { padding: "18px 20px", borderBottom: "1px solid var(--border)" } }, React.createElement(window.ExportWizardSteps, { step, labels })),
    React.createElement("div", { style: { padding: 20 } }, body));
}

function ScreenExport({ h = 720 }) {
  return React.createElement("div", { style: { position: "relative", width: "100%", height: h, overflow: "hidden", background: "var(--bg-primary)" } },
    React.createElement("div", { style: { filter: "saturate(0.7)", pointerEvents: "none", height: "100%", overflow: "hidden" } }, React.createElement(window.ScreenAgents, { tab: "CI", h })),
    React.createElement(ExportWizard, { onClose: () => {} }));
}

Object.assign(window, { ScreenExport, ExportWizard });
