"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { DiffOrder } from "../../constants";
import { s } from "./styles";

export function OrderToggle({ value, onChange }: { value: DiffOrder; onChange: (v: DiffOrder) => void }) {
  const t = useTranslations("prReview");
  return (
    <div role="group" style={s.wrap}>
      <Button
        kind="tertiary"
        size="sm"
        active={value === "smart"}
        aria-pressed={value === "smart"}
        onClick={() => onChange("smart")}
      >
        {t("smartDiff.smartOrder")}
      </Button>
      <Button
        kind="tertiary"
        size="sm"
        active={value === "original"}
        aria-pressed={value === "original"}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </Button>
    </div>
  );
}
