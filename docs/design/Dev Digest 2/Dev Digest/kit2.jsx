/* kit2.jsx — shared templates for iteration #2: Drawer, Modal, Tabs, Dropdown, FormField */

function Drawer({ width = 720, title, subtitle, onClose, children, footer }) {
  return React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end", zIndex: 50 } },
    React.createElement("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", animation: "ddfadein .15s ease" } }),
    React.createElement("div", { style: { position: "relative", width, maxWidth: "94%", background: "var(--bg-surface)", borderLeft: "1px solid var(--border-strong)", boxShadow: "var(--shadow-drawer)", display: "flex", flexDirection: "column", animation: "ddslidein .2s cubic-bezier(.2,.7,.3,1)" } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border)" } },
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" } }, title),
          subtitle && React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 } }, subtitle)),
        React.createElement(window.IconBtn, { icon: "X", label: "Close", onClick: onClose })),
      React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 20 } }, children),
      footer && React.createElement("div", { style: { borderTop: "1px solid var(--border)", padding: "14px 20px", background: "var(--bg-primary)" } }, footer)));
}

function Modal({ width = 720, title, subtitle, onClose, children, footer }) {
  return React.createElement("div", { style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 50, padding: 24 } },
    React.createElement("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "ddfadein .15s ease" } }),
    React.createElement("div", { style: { position: "relative", width, maxWidth: "100%", maxHeight: "92%", background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: 14, boxShadow: "var(--shadow-modal)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "ddpop .18s ease" } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border)" } },
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("div", { style: { fontSize: 15, fontWeight: 700 } }, title),
          subtitle && React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 } }, subtitle)),
        onClose && React.createElement(window.IconBtn, { icon: "X", label: "Close", onClick: onClose })),
      React.createElement("div", { style: { flex: 1, overflow: "auto" } }, children),
      footer && React.createElement("div", { style: { borderTop: "1px solid var(--border)", padding: "14px 20px", background: "var(--bg-surface)" } }, footer)));
}

function Tabs({ tabs, value, onChange, pad = "0 28px" }) {
  return React.createElement("div", { style: { display: "flex", gap: 2, padding: pad, borderBottom: "1px solid var(--border)" } },
    tabs.map((t) => {
      const k = typeof t === "string" ? t : t.key;
      const label = typeof t === "string" ? t : t.label;
      const icon = typeof t === "object" && t.icon;
      const on = value === k;
      return React.createElement("button", { key: k, onClick: () => onChange(k),
        style: { display: "flex", alignItems: "center", gap: 7, padding: "11px 15px", border: "none", background: "transparent",
          borderBottom: "2px solid " + (on ? "var(--accent)" : "transparent"), marginBottom: -1, cursor: "pointer",
          fontSize: 13, fontWeight: on ? 600 : 500, color: on ? "var(--text-primary)" : "var(--text-secondary)" } },
        icon && React.createElement(window.Icon[icon], { size: 14, style: { color: on ? "var(--accent)" : "var(--text-muted)" } }),
        label, typeof t === "object" && t.count != null && React.createElement("span", { className: "tnum", style: { fontSize: 11, color: "var(--text-muted)" } }, t.count));
    }));
}

function Dropdown({ trigger, items, align = "left", width = 230 }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  return React.createElement("div", { ref, style: { position: "relative", display: "inline-block" } },
    React.createElement("div", { onClick: () => setOpen((o) => !o) }, trigger),
    open && React.createElement("div", { style: { position: "absolute", top: "calc(100% + 6px)", [align]: 0, width, background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: 9, boxShadow: "var(--shadow-modal)", padding: 5, zIndex: 40, animation: "ddpop .12s ease" } },
      items.map((it, i) => it.divider
        ? React.createElement("div", { key: i, style: { height: 1, background: "var(--border)", margin: "5px 0" } })
        : React.createElement(DropdownItem, { key: i, it, onClose: () => setOpen(false) }))));
}

function DropdownItem({ it, onClose }) {
  const [h, setH] = React.useState(false);
  const I = it.icon && window.Icon[it.icon];
  return React.createElement("button", {
    onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    onClick: () => { it.onClick && it.onClick(); onClose(); },
    style: { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 9px", borderRadius: 6, border: "none",
      background: h ? "var(--bg-hover)" : "transparent", color: it.muted ? "var(--text-secondary)" : "var(--text-primary)",
      fontSize: 13, fontWeight: 500, textAlign: "left", cursor: "pointer" },
  }, I && React.createElement(I, { size: 14, style: { color: "var(--text-muted)", flexShrink: 0 } }),
     React.createElement("span", { style: { flex: 1 } }, it.label),
     it.hint && React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, it.hint));
}

function FormField({ label, hint, required, children, right }) {
  return React.createElement("div", { style: { marginBottom: 18 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 7 } },
      React.createElement("label", { style: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" } }, label,
        required && React.createElement("span", { style: { color: "var(--crit)", marginLeft: 3 } }, "*")),
      right && React.createElement("div", { style: { marginLeft: "auto" } }, right)),
    children,
    hint && React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 } }, hint));
}

function TextInput({ value, placeholder, mono, suffix }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)" } },
    React.createElement("span", { className: mono ? "mono" : undefined, style: { flex: 1, fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-muted)" } }, value || placeholder),
    suffix);
}

function SelectInput({ value, options }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", cursor: "pointer" } },
    React.createElement("span", { className: "mono", style: { flex: 1, fontSize: 13 } }, value),
    React.createElement(window.Icon.ChevronsUpDown, { size: 14, style: { color: "var(--text-muted)" } }));
}

Object.assign(window, { Drawer, Modal, Tabs, Dropdown, FormField, TextInput, SelectInput });
