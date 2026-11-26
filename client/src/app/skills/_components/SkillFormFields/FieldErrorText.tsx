"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FieldError } from "../helpers";
import { s } from "./styles";

/** Inline form error (`skills.form.errors.*`); renders nothing without an error. */
export function FieldErrorText({ id, error }: { id: string; error?: FieldError }) {
  const t = useTranslations("skills");
  if (!error) return null;
  return (
    <div id={id} style={s.error}>
      {t(`form.errors.${error.key}`, error.values)}
    </div>
  );
}
