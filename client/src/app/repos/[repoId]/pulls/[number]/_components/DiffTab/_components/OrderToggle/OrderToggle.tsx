/* OrderToggle — Smart order / Original order as one segmented control
   (server/specs/06-smart-diff.md, design/ diff.jsx). */
"use client";

import { useTranslations } from "next-intl";
import { DIFF_ORDERS, type DiffOrder } from "../../constants";
import { s } from "../../styles";

const LABEL_KEY: Record<DiffOrder, string> = {
  smart: "smartDiff.smartOrder",
  original: "smartDiff.originalOrder",
};

export function OrderToggle({ order, onSetOrder }: { order: DiffOrder; onSetOrder: (order: DiffOrder) => void }) {
  const t = useTranslations("prReview");
  return (
    <div style={s.segmented}>
      {DIFF_ORDERS.map((o) => (
        <button key={o} type="button" aria-pressed={order === o} onClick={() => onSetOrder(o)} style={s.segment(order === o)}>
          {t(LABEL_KEY[o])}
        </button>
      ))}
    </div>
  );
}
