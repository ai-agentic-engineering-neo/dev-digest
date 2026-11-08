import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastCounts } from "@/lib/types";
import { STATS } from "./constants";
import { s } from "./styles";

const strong = (chunks: ReactNode) => (
  <b className="tnum" style={s.num}>
    {chunks}
  </b>
);

/** Stat line as in the design: icon + bold number + muted label (<> 2 symbols · ↳ 14 callers · 🌐 3 endpoints · 🕐 1 cron). */
export function BlastSummary({ counts }: { counts: BlastCounts }) {
  const t = useTranslations("blast");
  return (
    <div role="group" aria-label={t("summary.ariaLabel")} style={s.row}>
      {STATS.map(({ key, icon }) => {
        const I = Icon[icon];
        return (
          <span key={key} style={s.stat}>
            <I size={13} aria-hidden style={s.icon} />
            <span>{t.rich(`summary.${key}`, { count: counts[key], n: strong })}</span>
          </span>
        );
      })}
    </div>
  );
}
