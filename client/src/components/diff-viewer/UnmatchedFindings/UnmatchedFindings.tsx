/* UnmatchedFindings — footer list for findings whose line isn't in the current
   patch (server/specs/06-smart-diff.md, "a finding whose line isn't in the
   diff is shown as a separate block, never dropped"). Mirrors OutdatedComments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cs } from "../comments";
import type { DiffFindingApi, DiffFindingItem } from "../findings";

export function UnmatchedFindings<T extends DiffFindingItem>({
  items,
  findingApi,
}: {
  items: T[];
  findingApi: DiffFindingApi<T>;
}) {
  const t = useTranslations("shell");
  if (!findingApi.show || items.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("diffViewer.unmatchedTitle")}</span>
      {items.map((item) => (
        <React.Fragment key={item.id}>{findingApi.renderCard(item)}</React.Fragment>
      ))}
    </div>
  );
}
