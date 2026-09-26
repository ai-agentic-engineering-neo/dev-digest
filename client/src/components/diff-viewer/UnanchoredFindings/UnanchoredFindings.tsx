/* UnanchoredFindings — footer list for findings that don't land on a rendered
   line (deleted file, `patch: null`, or a start_line outside every rendered
   hunk). Modeled on `OutdatedComments`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_RANK } from "@/lib/severity";
import type { DiffFindingApi } from "../findings";
import { s } from "../styles";

export function UnanchoredFindings({
  findings,
  findingApi,
}: {
  findings: FindingRecord[];
  findingApi: DiffFindingApi;
}) {
  const t = useTranslations("shell.diffViewer");
  if (findings.length === 0) return null;

  const sorted = [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const Card = findingApi.Card;

  return (
    <div style={s.unanchoredWrap}>
      <span style={s.unanchoredTitle}>{t("unanchoredTitle", { count: findings.length })}</span>
      {sorted.map((f) => (
        <Card
          key={f.id}
          f={f}
          defaultExpanded={false}
          pending={findingApi.pending}
          onAction={(a) => findingApi.onAction(f.id, a)}
        />
      ))}
    </div>
  );
}
