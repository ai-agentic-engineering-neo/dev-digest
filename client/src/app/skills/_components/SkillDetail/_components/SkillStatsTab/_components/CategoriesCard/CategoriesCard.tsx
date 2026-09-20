import React from "react";
import { useTranslations } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";
import { buildSegments } from "../../helpers";
import { DonutChart } from "../DonutChart";
import { cardStyles, s } from "./styles";

export function CategoriesCard({ byCategory }: { byCategory: SkillStats["by_category"] }) {
  const t = useTranslations("skillStats");
  const segments = buildSegments(byCategory);
  const nameOf = (seg: { category: string; isOther: boolean }) => (seg.isOther ? t("categories.other") : seg.category);
  const summary = segments.map((seg) => `${nameOf(seg)} ${seg.count}`).join(", ");

  return (
    <section style={cardStyles.card} aria-labelledby="skill-stats-cat-title">
      <h3 id="skill-stats-cat-title" style={cardStyles.title}>
        <Icon.Tag size={14} />
        {t("categories.title")}
      </h3>
      {segments.length === 0 ? (
        <p style={cardStyles.muted}>{t("categories.none")}</p>
      ) : (
        <div style={s.body}>
          <DonutChart segments={segments} label={t("categories.chartAria", { summary })} />
          <ul style={s.legend}>
            {segments.map((seg) => (
              <li key={seg.category} style={s.item}>
                <span style={{ ...s.swatch, background: seg.color }} aria-hidden="true" />
                <span style={s.cat}>{nameOf(seg)}</span>
                <span style={s.count}>{seg.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
