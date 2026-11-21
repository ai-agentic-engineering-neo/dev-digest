"use client";

import { useTranslations } from "next-intl";
import type { ProjectGraphFileSort } from "@devdigest/shared";
import { Skeleton } from "@devdigest/ui";
import { useProjectGraphFiles } from "@/lib/hooks/project-graph";
import { Pager } from "./Pager";
import { s } from "./styles";

export const TABLE_ID = "project-graph-files-table";

const COLUMNS: { sort: ProjectGraphFileSort; key: "file" | "in" | "out" | "rank" | "hotness" }[] = [
  { sort: "path", key: "file" },
  { sort: "in", key: "in" },
  { sort: "out", key: "out" },
  { sort: "rank", key: "rank" },
  { sort: "hotness", key: "hotness" },
];

/** Keyboard-navigable, non-visual equivalent of the canvas (AC-51): plain
 *  <table>, sortable via real buttons in the headers, paged, rows open a file. */
export function FilesTable({
  repoId,
  dir,
  page,
  sort,
  onPage,
  onSort,
  onOpenFile,
}: {
  repoId: string;
  dir: string | null;
  page: number;
  sort: ProjectGraphFileSort;
  onPage: (p: number) => void;
  onSort: (s: ProjectGraphFileSort) => void;
  onOpenFile: (path: string) => void;
}) {
  const t = useTranslations("projectGraph.table");
  const { data, isLoading } = useProjectGraphFiles(repoId, { dir, page, sort });

  return (
    <section id={TABLE_ID} aria-labelledby={`${TABLE_ID}-h`} style={s.panel}>
      <h2 id={`${TABLE_ID}-h`} style={s.panelTitle}>
        {t("title")}
      </h2>
      {isLoading || !data ? (
        <Skeleton height={120} />
      ) : data.state !== "ready" ? null : data.items.length === 0 ? (
        <p style={s.muted}>{t("none")}</p>
      ) : (
        <>
          <table style={s.table}>
            <caption style={{ ...s.muted, textAlign: "left" }}>{t("caption")}</caption>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.sort}
                    scope="col"
                    style={s.th}
                    aria-sort={c.sort === sort ? (c.sort === "path" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      style={s.linkBtn}
                      aria-label={t("sortBy", { column: t(c.key) })}
                      onClick={() => onSort(c.sort)}
                    >
                      {t(c.key)}
                    </button>
                  </th>
                ))}
                <th scope="col" style={s.th}>
                  {t("cycle")}
                </th>
                <th scope="col" style={s.th}>
                  {t("hot")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.path}>
                  <th scope="row" style={{ ...s.td, textAlign: "left", fontWeight: 400 }}>
                    <button
                      type="button"
                      style={{ ...s.linkBtn, ...s.mono }}
                      aria-label={t("open", { path: r.path })}
                      onClick={() => onOpenFile(r.path)}
                    >
                      {r.path}
                    </button>
                  </th>
                  <td style={s.td}>{r.inCount}</td>
                  <td style={s.td}>{r.outCount}</td>
                  <td style={s.td}>{r.rank.toFixed(3)}</td>
                  <td style={s.td}>{r.hotness.toFixed(2)}</td>
                  <td style={s.td}>{r.inCycle ? t("yes") : t("no")}</td>
                  <td style={s.td}>{r.hot ? t("yes") : t("no")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={onPage} />
        </>
      )}
    </section>
  );
}
