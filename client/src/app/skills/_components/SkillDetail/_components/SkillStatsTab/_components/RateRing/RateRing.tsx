import React from "react";
import { useTranslations } from "next-intl";
import { formatPercent } from "../../helpers";

const SIZE = 36;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Small circular progress ring; rate is a fraction 0..1. */
export function RateRing({ rate }: { rate: number }) {
  const t = useTranslations("skillStats");
  const clamped = Math.min(1, Math.max(0, rate));
  const pct = formatPercent(clamped) ?? "0";
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={t("ring.aria", { percent: pct })}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${C * clamped} ${C}`}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="var(--text-primary)">
        {pct}
      </text>
    </svg>
  );
}
