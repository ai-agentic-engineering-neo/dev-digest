"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { useProjectGraphSymbols } from "@/lib/hooks/project-graph";
import { Pager } from "./Pager";
import { s } from "./styles";

/** File drill-down: paged symbol list (the canvas shows the in/out symbol edges). */
export function SymbolsPanel({ repoId, file }: { repoId: string; file: string }) {
  const t = useTranslations("projectGraph.symbols");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useProjectGraphSymbols(repoId, { file, page });
  return (
    <section aria-labelledby="pg-symbols-h" style={s.panel}>
      <h2 id="pg-symbols-h" style={s.panelTitle}>
        {t("title", { path: file })}
      </h2>
      {isLoading || !data ? (
        <Skeleton height={60} />
      ) : data.state !== "ready" ? null : data.items.length === 0 ? (
        <p style={s.muted}>{t("none")}</p>
      ) : (
        <>
          <table style={s.table}>
            <thead>
              <tr>
                {(["name", "kind", "line", "exported", "in", "out"] as const).map((k) => (
                  <th key={k} scope="col" style={s.th}>
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((y) => (
                <tr key={`${y.name}:${y.line}`}>
                  <td style={{ ...s.td, ...s.mono }}>{y.name}</td>
                  <td style={s.td}>{y.kind}</td>
                  <td style={s.td}>{y.line ?? ""}</td>
                  <td style={s.td}>{y.exported ? "✓" : ""}</td>
                  <td style={s.td}>{y.inCount}</td>
                  <td style={s.td}>{y.outCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
