import React from "react";
import { Icon } from "../icons";
import { type DropdownItemDef } from "./types";

function DropdownItem({ it, onClose }: { it: DropdownItemDef; onClose: () => void }) {
  const [h, setH] = React.useState(false);
  const I = it.icon ? Icon[it.icon] : null;
  return (
    <button
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => {
        it.onClick?.();
        onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 6,
        border: "none",
        background: h ? "var(--bg-hover)" : "transparent",
        color: it.muted ? "var(--text-secondary)" : "var(--text-primary)",
        fontSize: 14,
        fontWeight: 500,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {I && <I size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{it.label}</span>
      {it.hint && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{it.hint}</span>}
      {it.onRemove && (
        <span
          role="button"
          aria-label={it.removeLabel ?? "Remove"}
          title={it.removeLabel ?? "Remove"}
          onClick={(e) => {
            e.stopPropagation();
            it.onRemove!();
            onClose();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 3,
            borderRadius: 5,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          <Icon.Trash size={13} />
        </span>
      )}
    </button>
  );
}

export function Dropdown({
  trigger,
  items,
  align = "left",
  width = 230,
}: {
  trigger: React.ReactNode;
  items: DropdownItemDef[];
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            [align]: 0,
            width,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            padding: 6,
            zIndex: 40,
            animation: "ddpop .12s ease",
          }}
        >
          {items.map((it, i) =>
            it.divider ? (
              <div key={i} style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
            ) : (
              <DropdownItem key={i} it={it} onClose={() => setOpen(false)} />
            )
          )}
        </div>
      )}
    </div>
  );
}
