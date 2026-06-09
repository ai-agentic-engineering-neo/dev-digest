import React from "react";
import { Icon } from "../icons";

/** REAL controlled checkbox (styled). */
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label?: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 14,
        color: "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange?.(!checked)}
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "1.5px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
          background: checked ? "var(--accent)" : "transparent",
          display: "grid",
          placeItems: "center",
          padding: 0,
        }}
      >
        {checked && <Icon.Check size={11} style={{ color: "#fff" }} />}
      </button>
      {label}
    </label>
  );
}
