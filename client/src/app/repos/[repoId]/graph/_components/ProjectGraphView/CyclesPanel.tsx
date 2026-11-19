"use client";

import { useTranslations } from "next-intl";
import type { ProjectGraphReady } from "@devdigest/shared";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function CyclesPanel({
  cycles,
  hotFiles,
  highlighted,
  onHighlight,
}: {
  cycles: ProjectGraphReady["cycles"];
  hotFiles: ProjectGraphReady["hotFiles"];
  /** Index of the highlighted cycle, or null. */
  highlighted: number | null;
  onHighlight: (i: number | null) => void;
}) {
  const t = useTranslations("projectGraph");
  return (
    <>
      <section aria-labelledby="pg-cycles-h" style={s.panel}>
        <h2 id="pg-cycles-h" style={s.panelTitle}>
          {t("cycles.title")}
        </h2>
        {cycles.total === 0 ? (
          <p style={s.muted}>{t("cycles.none")}</p>
        ) : (
          <>
            <p style={s.muted}>{t("cycles.summary", { total: cycles.total, files: cycles.filesInCycles })}</p>
            <ul style={{ ...s.list, listStyle: "none", paddingLeft: 0 }}>
              {cycles.items.map((c, i) => (
                <li key={c.members.join("|")} style={s.panel}>
                  <div style={s.row}>
                    <strong>{t("cycles.item", { size: c.size })}</strong>
                    {highlighted === i ? (
                      <Button size="sm" onClick={() => onHighlight(null)}>
                        {t("cycles.clear")}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => onHighlight(i)}>
                        {t("cycles.highlight", { index: i + 1 })}
                      </Button>
                    )}
                    {highlighted === i && <span style={s.muted}>{t("cycles.highlighted")}</span>}
                  </div>
                  <ul style={s.list}>
                    {c.members.map((m) => (
                      <li key={m} style={s.mono}>
                        {m}
                      </li>
                    ))}
                  </ul>
                  {c.membersTruncated && <p style={s.muted}>{t("cycles.more", { count: c.size - c.members.length })}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {hotFiles.length > 0 && (
        <section aria-labelledby="pg-hot-h" style={s.panel}>
          <h2 id="pg-hot-h" style={s.panelTitle}>
            {t("hot.title")}
          </h2>
          <ul style={s.list}>
            {hotFiles.map((h) => (
              <li key={h.path} style={s.mono}>
                {t("hot.item", { path: h.path, rank: h.rank.toFixed(3), hotness: h.hotness.toFixed(2) })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
