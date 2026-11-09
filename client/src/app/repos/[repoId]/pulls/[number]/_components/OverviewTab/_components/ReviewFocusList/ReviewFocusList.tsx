"use client";

import { useTranslations } from "next-intl";
import type { BriefFocusItem } from "@/lib/types";
import { BriefFileLink, fileLocation } from "../BriefFileLink";
import { s } from "./styles";

interface Shared {
  repoFullName: string | null;
  linkSha: string | null;
  onOpenFile: (path: string) => void;
}

function FocusItem({ item, repoFullName, linkSha, onOpenFile }: Shared & { item: BriefFocusItem }) {
  const t = useTranslations("brief");
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
        label={t("focus.item", { location: fileLocation(item.file, line), reason: item.reason })}
      />
    </li>
  );
}

/** Full-width "Review focus — read these first" list, in model order; items open the file in Files changed or on GitHub. */
export function ReviewFocusList({
  items,
  repoFullName,
  linkSha,
  onOpenFile,
}: Shared & { items: BriefFocusItem[] }) {
  const t = useTranslations("brief");

  return (
    <section style={s.root}>
      <h3 style={s.heading}>{t("focus.title", { count: items.length })}</h3>
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
