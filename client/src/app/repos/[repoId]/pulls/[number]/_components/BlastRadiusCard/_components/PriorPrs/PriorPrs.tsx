/* PriorPrs — collapsed disclosure listing the repo's other PRs that touched the
   same files: number, title (link to GitHub), author, date, overlap, first line
   of the body as a note. Starts collapsed; the header shows the count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Avatar, Badge, Icon } from "@devdigest/ui";
import type { PrHistoryItem } from "@devdigest/shared";
import { githubPrUrl } from "@/lib/github-urls";
import { isoDate } from "../../helpers";
import { s } from "./styles";

export function PriorPrs({ items, repoFullName }: { items: PrHistoryItem[]; repoFullName: string | null }) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.wrap}>
      <button type="button" style={s.header} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon.History size={14} style={s.headIcon} />
        <span>{t("history.title")}</span>
        <Badge>{items.length}</Badge>
        <span style={s.spacer} />
        <Chevron size={14} style={s.chevron} />
      </button>
      {open &&
        (items.length === 0 ? (
          <div style={s.empty}>{t("history.empty")}</div>
        ) : (
          <ul style={s.list}>
            {items.map((p, i) => (
              <li key={p.pr_number} style={i === items.length - 1 ? s.itemLast : s.item}>
                <div style={s.titleRow}>
                  <span className="mono" style={s.number}>{`#${p.pr_number}`}</span>
                  {repoFullName ? (
                    <a href={githubPrUrl(repoFullName, p.pr_number)} target="_blank" rel="noreferrer" style={s.title}>
                      {p.title}
                    </a>
                  ) : (
                    <span style={s.title}>{p.title}</span>
                  )}
                </div>
                <div style={s.meta}>
                  <Avatar name={p.author} size={16} />
                  <span>{p.author}</span>
                  <span>·</span>
                  <span className="tnum">{isoDate(p.merged_at)}</span>
                  <span>·</span>
                  <span>{t("history.overlap", { count: p.files_overlap.length })}</span>
                </div>
                {p.notes && <div style={s.notes}>{p.notes}</div>}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
