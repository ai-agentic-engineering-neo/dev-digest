"use client";

import { useTranslations } from "next-intl";
import type { DiffOrder } from "../constants";
import { s } from "./styles";

interface OrderToggleProps {
  value: DiffOrder;
  onChange: (order: DiffOrder) => void;
}

/** Segmented radiogroup: smart (grouped by role) vs original (GitHub) order. */
export function OrderToggle({ value, onChange }: OrderToggleProps) {
  const t = useTranslations("prReview.smartDiff");
  const options: { order: DiffOrder; label: string }[] = [
    { order: "smart", label: t("orderSmart") },
    { order: "original", label: t("orderOriginal") },
  ];
  return (
    <div role="radiogroup" aria-label={t("orderLabel")} style={s.group}>
      {options.map((o) => (
        <button
          key={o.order}
          type="button"
          role="radio"
          aria-checked={value === o.order}
          onClick={() => onChange(o.order)}
          style={s.option(value === o.order)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
