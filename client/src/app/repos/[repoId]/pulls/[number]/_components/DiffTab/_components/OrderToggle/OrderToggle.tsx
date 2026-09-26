/* OrderToggle — Smart order / Original order switch. Two Chips in a group,
   same precedent as `pulls/_components/FilterBar.tsx` (no segmented-control
   primitive in @devdigest/ui; `Tabs` draws a second underline and would
   duplicate the page's own tabs). */
"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import type { DiffOrder } from "../../helpers";

export function OrderToggle({
  order,
  onChange,
}: {
  order: DiffOrder;
  onChange: (order: DiffOrder) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("smartDiff.orderGroupLabel")} style={{ display: "flex", gap: 6 }}>
      <Chip active={order === "smart"} onClick={() => onChange("smart")}>
        {t("smartDiff.orderSmart")}
      </Chip>
      <Chip active={order === "original"} onClick={() => onChange("original")}>
        {t("smartDiff.orderOriginal")}
      </Chip>
    </div>
  );
}
