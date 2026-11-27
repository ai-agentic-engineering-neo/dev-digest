import React from "react";

export function Toggle({
  on,
  onChange,
  size = 18,
  disabled,
  title,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  size?: number;
  /** Locked: no click, dimmed, `not-allowed` cursor (e.g. a flagged skill). */
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      title={title}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        width: size * 1.85,
        height: size + 4,
        borderRadius: 99,
        border: "none",
        padding: 2,
        background: on ? "var(--accent)" : "var(--border-strong)",
        transition: "background .15s",
        position: "relative",
      }}
    >
      <span
        style={{
          display: "block",
          width: size,
          height: size,
          borderRadius: 99,
          background: "#fff",
          transform: on ? `translateX(${size * 0.85}px)` : "none",
          transition: "transform .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }}
      />
    </button>
  );
}
