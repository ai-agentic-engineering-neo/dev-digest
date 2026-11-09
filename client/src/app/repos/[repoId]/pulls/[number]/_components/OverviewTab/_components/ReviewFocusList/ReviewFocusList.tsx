"use client";

import { useTranslations } from "next-intl";
import type { OpenDiffTarget } from "@/components/diff-viewer";
import type { BriefFocusItem } from "@/lib/types";
import { BriefFileLink, fileLocation } from "../BriefFileLink";
import { BriefSectionLabel } from "../BriefSectionLabel";
import { s } from "./styles";

interface Shared {
  repoFullName: string | null;
  linkSha: string | null;
  onOpenFile: OpenDiffTarget;
}

function FocusItem({ item, repoFullName, linkSha, onOpenFile }: Shared & { item: BriefFocusItem }) {
  const line = item.file_level ? null : item.line;
  return (
    <li style={s.item}>
      <BriefFileLink
        path={item.file}
        line={line}
        inDiff={item.in_diff}
        repoFullName={repoFullName}
        linkSha={linkSha}
        onOpenFile={onOpenFile}
        label={fileLocation(item.file, line)}
        reason={item.reason}
      />
    </li>
  );
}

/** Full-width "Review focus — read these first" list, in model order; items open the file (at the line) in Files changed or on GitHub. */
export function ReviewFocusList({
  items,
  repoFullName,
  linkSha,
  onOpenFile,
}: Shared & { items: BriefFocusItem[] }) {
  const t = useTranslations("brief");

  return (
    <section style={s.root}>
      <BriefSectionLabel icon="ListChecks" count={items.length}>
        {t("focus.title")}
      </BriefSectionLabel>
      {items.length === 0 ? (
        <p style={s.empty}>{t("noFocus")}</p>
      ) : (
        <ol style={s.list}>
          {items.map((item) => (
            <FocusItem
              key={`${item.file}:${item.line}`}
              item={item}
              repoFullName={repoFullName}
              linkSha={linkSha}
              onOpenFile={onOpenFile}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
