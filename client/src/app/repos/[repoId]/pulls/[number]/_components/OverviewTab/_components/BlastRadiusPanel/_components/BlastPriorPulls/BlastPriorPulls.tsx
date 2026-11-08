"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PriorPullsResponse } from "@/lib/types";
import { preventMouseFocus } from "../../helpers";
import { s } from "./styles";

export interface PriorPullsQuery {
  data: PriorPullsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

/** Card footer: "Prior PRs touching these files N ▾" — earlier PRs of the same repo sharing a changed path.
    The query is owned by the panel so it starts in parallel with /blast. */
export function BlastPriorPulls({ repoId, query }: { repoId: string; query: PriorPullsQuery }) {
  const t = useTranslations("blast");
  const { data, isLoading, isError } = query;
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (isLoading) {
    return (
      <div style={s.root}>
        <div style={s.static}>
          <Icon.History size={13} aria-hidden style={s.icon} />
          <span>{t("prior.title")}</span>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={s.root}>
        <p style={s.note}>{t("prior.loadError")}</p>
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div style={s.root}>
        <div style={s.static}>
          <Icon.History size={13} aria-hidden style={s.icon} />
          <span>{t("prior.title")}</span>
          <span style={s.count}>0</span>
        </div>
        <p style={s.note}>{t("prior.empty")}</p>
      </div>
    );
  }

  const hidden = data.total - data.pulls.length;
  return (
    <div style={s.root}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseDown={preventMouseFocus}
        style={s.toggle}
      >
        <Icon.History size={13} aria-hidden style={s.icon} />
        <span>{t("prior.title")}</span>
        <span style={s.count} aria-hidden>
          {data.total}
        </span>
        <span style={s.srOnly}>{t("prior.countAria", { count: data.total })}</span>
        <Icon.ChevronDown size={13} aria-hidden style={open ? s.chevronOpen : s.chevron} />
      </button>
      {open && (
        <ul id={listId} style={s.list}>
          {data.pulls.map((p) => (
            <li key={p.pr_id} style={s.item}>
              <Link href={`/repos/${repoId}/pulls/${p.number}`} style={s.link}>
                <span className="mono" style={s.number}>
                  #{p.number}
                </span>{" "}
                {p.title}
              </Link>
              <span style={s.meta} title={p.shared_files.join("\n")}>
                {p.author} · {t("prior.sharedFiles", { count: p.shared_count })}
              </span>
            </li>
          ))}
          {hidden > 0 && <li style={s.note}>{t("prior.more", { count: hidden })}</li>}
        </ul>
      )}
    </div>
  );
}
