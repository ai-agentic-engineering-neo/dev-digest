"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ProjectGraphIndex } from "@devdigest/shared";
import { Skeleton } from "@devdigest/ui";
import { useProjectGraphUnresolved } from "@/lib/hooks/project-graph";
import { Pager } from "./Pager";
import { s } from "./styles";

/** Index status, indexed SHA, coverage numbers (AC-50) and the paged unresolved list. */
export function IndexPanel({ repoId, index }: { repoId: string; index: ProjectGraphIndex }) {
  const t = useTranslations("projectGraph");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useProjectGraphUnresolved(repoId, { page });
  const cov = index.coverage;

  return (
    <section aria-labelledby="pg-index-h" style={s.panel}>
      <h2 id="pg-index-h" style={s.panelTitle}>
        {t("index.title")}
      </h2>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", margin: 0 }}>
        <dt>{t("index.status")}</dt>
        <dd>{t(`index.statuses.${index.status}`)}</dd>
        <dt>{t("index.sha")}</dt>
        <dd style={s.mono}>{index.indexedSha}</dd>
        <dt>{t("index.version")}</dt>
        <dd>{index.indexerVersion}</dd>
        {cov && (
          <>
            <dt>{t("index.valueBindings")}</dt>
            <dd>{t("index.ratio", cov.value)}</dd>
            <dt>{t("index.typeBindings")}</dt>
            <dd>{t("index.ratio", cov.type)}</dd>
            <dt>{t("index.unresolved")}</dt>
            <dd>{cov.unresolvedBySpecifier}</dd>
            <dt>{t("index.inferred")}</dt>
            <dd>{Math.round(cov.inferredShare * 100)}%</dd>
            {cov.tsconfigFailures.length > 0 && (
              <>
                <dt>{t("index.tsconfigFailures")}</dt>
                <dd style={s.mono}>{cov.tsconfigFailures.map((f) => f.path).join(", ")}</dd>
              </>
            )}
          </>
        )}
      </dl>

      <h3 style={s.panelTitle}>{t("unresolved.title")}</h3>
      {isLoading || !data ? (
        <Skeleton height={60} />
      ) : data.state !== "ready" ? null : data.items.length === 0 ? (
        <p style={s.muted}>{t("unresolved.none")}</p>
      ) : (
        <>
          <table style={s.table}>
            <thead>
              <tr>
                {(["file", "specifier", "name", "line", "reason"] as const).map((k) => (
                  <th key={k} scope="col" style={s.th}>
                    {t(`unresolved.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={`${u.file}:${u.line}:${u.specifier}:${u.importedName}`}>
                  <td style={{ ...s.td, ...s.mono }}>{u.file}</td>
                  <td style={{ ...s.td, ...s.mono }}>{u.specifier}</td>
                  <td style={{ ...s.td, ...s.mono }}>{u.importedName}</td>
                  <td style={s.td}>{u.line}</td>
                  <td style={s.td}>{u.reason}</td>
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
