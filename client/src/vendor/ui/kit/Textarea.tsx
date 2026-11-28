import React from "react";
import { useFormFieldId } from "./FormField";

/** REAL controlled textarea. */
export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 5,
  mono,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const fieldId = useFormFieldId();
  return (
    <textarea
      id={id ?? fieldId}
      aria-label={ariaLabel}
      className={mono ? "mono" : undefined}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        width: "100%",
        resize: "vertical",
        padding: "10px 12px",
        borderRadius: 7,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        fontSize: 14,
        lineHeight: 1.55,
        outline: "none",
      }}
    />
  );
}
