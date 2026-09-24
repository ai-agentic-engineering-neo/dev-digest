/* OrderToggle — Smart order / Original order (server/specs/06-smart-diff.md). */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { DiffOrder } from "../../constants";

export function OrderToggle({ order, onSetOrder }: { order: DiffOrder; onSetOrder: (order: DiffOrder) => void }) {
  const t = useTranslations("prReview");
  return (
    <div style={{ display: "inline-flex", gap: 4 }}>
      <Button kind="ghost" size="sm" active={order === "smart"} onClick={() => onSetOrder("smart")}>
        {t("smartDiff.smartOrder")}
      </Button>
      <Button kind="ghost" size="sm" active={order === "original"} onClick={() => onSetOrder("original")}>
        {t("smartDiff.originalOrder")}
      </Button>
    </div>
  );
}
