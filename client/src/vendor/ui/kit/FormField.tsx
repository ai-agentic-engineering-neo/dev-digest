import React from "react";

export function FormField({
  label,
  hint,
  required,
  children,
  right,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
          {label}
          {required && <span style={{ color: "var(--crit)", marginLeft: 4 }}>*</span>}
        </label>
        {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 }}>{hint}</div>
      )}
    </div>
  );
}
