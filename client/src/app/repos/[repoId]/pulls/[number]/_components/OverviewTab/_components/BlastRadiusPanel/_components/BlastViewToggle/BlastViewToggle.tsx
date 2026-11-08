"use client";

import { useTranslations } from "next-intl";
import { BLAST_VIEWS, type BlastView } from "./constants";
import { s } from "./styles";

/** Segmented Tree / Graph switch: a named group of two pressed-state buttons. */
export function BlastViewToggle({ value, onChange }: { value: BlastView; onChange: (v: BlastView) => void }) {
  const t = useTranslations("blast");
  return (
    <div role="group" aria-label={t("view.ariaLabel")} style={s.root}>
      {BLAST_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          style={value === v ? s.active : s.option}
        >
          {t(`view.${v}`)}
        </button>
      ))}
    </div>
  );
}
