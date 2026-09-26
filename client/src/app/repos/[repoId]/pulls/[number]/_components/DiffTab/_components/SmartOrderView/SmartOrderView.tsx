/* SmartOrderView — the Smart-order body of DiffTab: an optional "PR is
   large" banner, then one FileGroup per non-empty role. */
"use client";

import { useTranslations } from "next-intl";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import type { DiffCommentApi, DiffFindingApi } from "@/components/diff-viewer";
import { layoutSmartGroups } from "../../helpers";
import { FileGroup } from "../FileGroup";
import { s } from "./styles";

function LargePrBanner({ totalLines }: { totalLines: number }) {
  const t = useTranslations("prReview");
  return (
    <div style={s.banner}>
      <div style={s.bannerTitle}>{t("smartDiff.largeTitle", { lines: totalLines })}</div>
      <div style={s.bannerBody}>{t("smartDiff.largeBody")}</div>
    </div>
  );
}

export function SmartOrderView({
  files,
  smart,
  byFile,
  commenting,
  findings,
}: {
  files: PrFile[];
  smart: SmartDiff;
  byFile: Map<string, FindingRecord[]>;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const groups = layoutSmartGroups(files, smart);
  return (
    <div style={s.list}>
      {smart.split_suggestion.too_big && <LargePrBanner totalLines={smart.split_suggestion.total_lines} />}
      {groups.map((g) => (
        <FileGroup
          key={g.role}
          role={g.role}
          files={g.files}
          byFile={byFile}
          commenting={commenting}
          findings={findings}
        />
      ))}
    </div>
  );
}
