"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";

export interface NameFormProps {
  label: string;
  placeholder: string;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NameForm({ label, placeholder, error, onSubmit, onCancel }: NameFormProps) {
  const t = useTranslations("context");
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(name);
  };

  return (
    <form style={s.form} onSubmit={submit}>
      <label htmlFor={inputId} style={s.label}>
        {label}
      </label>
      <input
        id={inputId}
        style={s.input}
        value={name}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoFocus
      />
      {error && (
        <div id={errorId} role="alert" style={s.error}>
          {error}
        </div>
      )}
      <div style={s.formActions}>
        <Button type="submit" kind="primary" size="sm">
          {t("form.create")}
        </Button>
        <Button type="button" size="sm" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default NameForm;
