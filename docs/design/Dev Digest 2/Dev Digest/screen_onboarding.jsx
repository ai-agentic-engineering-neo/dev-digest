/* screen_onboarding.jsx — first-run wizard, centered full-screen */

function Stepper({ step }) {
  const steps = ["OpenAI key", "GitHub PAT", "Add repo"];
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 0, marginBottom: 30 } },
    steps.map((s, i) => React.createElement(React.Fragment, { key: i },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9 } },
        React.createElement("div", { style: { width: 26, height: 26, borderRadius: 99, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700,
          background: i < step ? "var(--ok)" : i === step ? "var(--accent)" : "var(--bg-elevated)",
          color: i <= step ? "#fff" : "var(--text-muted)", border: i > step ? "1px solid var(--border-strong)" : "none" } },
          i < step ? React.createElement(window.Icon.Check, { size: 14 }) : (i + 1)),
        React.createElement("span", { style: { fontSize: 12.5, fontWeight: i === step ? 600 : 500, color: i <= step ? "var(--text-primary)" : "var(--text-muted)" } }, s)),
      i < steps.length - 1 && React.createElement("div", { style: { width: 40, height: 1, background: "var(--border-strong)", margin: "0 14px" } }))));
}

function Field({ label, mono, value, placeholder, suffix, helper, link }) {
  return React.createElement("div", { style: { marginBottom: 18 } },
    React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, marginBottom: 7, color: "var(--text-secondary)" } }, label,
      link && React.createElement("a", { style: { marginLeft: "auto", fontSize: 12, color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 3 } }, link, React.createElement(window.Icon.ArrowRight, { size: 11 }))),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" } },
      React.createElement("span", { className: mono ? "mono" : undefined, style: { flex: 1, fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-muted)" } }, value || placeholder),
      suffix),
    helper && React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 } },
      React.createElement(window.Icon.Lock, { size: 11 }), helper));
}

function ScreenOnboarding({ h = 680 }) {
  return React.createElement("div", { style: { width: "100%", minHeight: h, background: "var(--bg-primary)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 28 } },
      React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, background: "var(--text-primary)", display: "grid", placeItems: "center" } },
        React.createElement(window.Icon.Layers, { size: 17, style: { color: "var(--bg-primary)" } })),
      React.createElement("span", { style: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" } }, "DevDigest")),
    React.createElement("div", { style: { width: 520, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 14, padding: 32, boxShadow: "var(--shadow-modal)" } },
      React.createElement(Stepper, { step: 0 }),
      React.createElement("h1", { style: { fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" } }, "Connect your OpenAI account"),
      React.createElement("p", { style: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24, lineHeight: 1.5 } }, "DevDigest uses your own key for every model call. Nothing runs through our servers."),
      React.createElement(Field, { label: "API key", mono: true, value: "sk-••••••••••••••••••••••••3a9f", link: "Where to get your key",
        suffix: React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement(window.Icon.EyeOff, { size: 14, style: { color: "var(--text-muted)", cursor: "pointer" } }),
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--ok)" } }, React.createElement(window.Icon.CheckCircle, { size: 13 }), "Connected")),
        helper: "Stored locally on your machine — never uploaded." }),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "var(--ok-bg)", border: "1px solid rgba(16,185,129,0.25)", marginBottom: 24 } },
        React.createElement(window.Icon.CheckCircle, { size: 16, style: { color: "var(--ok)" } }),
        React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-secondary)" } }, "Connection verified · ", React.createElement("span", { className: "mono" }, "gpt-4.1"), " reachable · 142ms")),
      React.createElement("div", { style: { display: "flex", gap: 10 } },
        React.createElement(window.Button, { kind: "ghost", size: "md" }, "Back"),
        React.createElement("div", { style: { flex: 1 } }),
        React.createElement(window.Button, { kind: "primary", size: "md", iconRight: "ArrowRight" }, "Continue"))),
    React.createElement("p", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 20 } }, "Step 1 of 3 · You can change keys later in Settings"));
}

Object.assign(window, { ScreenOnboarding });
