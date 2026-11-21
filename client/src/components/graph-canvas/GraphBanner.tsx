"use client";

import { useTranslations } from "next-intl";
import type { BannerCondition } from "./types";

/** Non-blocking banner listing every active graph condition (truncated, partial, reindexing…). */
export function GraphBanner({ conditions }: { conditions: BannerCondition[] }) {
  const t = useTranslations("graph");
  if (conditions.length === 0) return null;
  return (
    <section
      aria-label={t("banner.label")}
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
        {conditions.map((c) => (
          <li key={c.id} data-tone={c.tone ?? "info"}>
            <strong style={{ color: c.tone === "warning" ? "var(--warn)" : "var(--info)" }}>
              {c.tone === "warning" ? t("banner.warning") : t("banner.info")}:
            </strong>{" "}
            {c.text}
            {c.stats?.map((s) => (
              <span key={s.label} style={{ marginLeft: 8, color: "var(--text-muted)" }}>
                {s.label}: {s.value}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
