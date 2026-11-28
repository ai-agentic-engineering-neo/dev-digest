import React from "react";

const FormFieldIdContext = React.createContext<string | undefined>(undefined);

/** The id a `FormField` assigned to its control; kit inputs apply it so the label is associated. */
export function useFormFieldId(): string | undefined {
  return React.useContext(FormFieldIdContext);
}

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
  const id = React.useId();
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
          {label}
          {required && <span style={{ color: "var(--crit)", marginLeft: 4 }}>*</span>}
        </label>
        {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
      </div>
      <FormFieldIdContext.Provider value={id}>{children}</FormFieldIdContext.Provider>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 }}>{hint}</div>
      )}
    </div>
  );
}
