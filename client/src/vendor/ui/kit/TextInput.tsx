import React from "react";
import { useFormFieldId } from "./FormField";

/** REAL controlled text input (prototype TextInput was display-only). */
export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  type = "text",
  suffix,
  id,
  ...rest
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  suffix?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size">) {
  const fieldId = useFormFieldId();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 7,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
      }}
    >
      <input
        {...rest}
        id={id ?? fieldId}
        type={type}
        className={mono ? "mono" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          flex: 1,
          fontSize: 14,
          color: "var(--text-primary)",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
        }}
      />
      {suffix}
    </div>
  );
}
