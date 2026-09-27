/* PriorPrsSection — "Prior PRs touching these files": a collapsed-by-default
   list of prior PRs (same repo) that changed at least one file this PR also
   changes, most-overlapping first. Deterministic (file-path overlap), no LLM
   call — see server/src/modules/pr-history/service.ts. Hidden entirely when
   there's nothing to show (no history is not an error state worth a card). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrHistoryItem } from "@devdigest/shared";
import { usePrHistory } from "../../../../../../../../../lib/hooks/pr-history";
import { githubPrUrl } from "../../../../../../../../../lib/github-urls";
import { relativeTime } from "../../../../../helpers";
import { s } from "./styles";

export function PriorPrsSection({
  prId,
  repoFullName,
}: {
  prId: string | null;
  repoFullName: string | null;
}) {
  const t = useTranslations("prReview");
  const { data } = usePrHistory(prId);
  const [open, setOpen] = React.useState(false);

  if (!data || data.history.length === 0) return null;

  return (
    <div style={s.priorPrs}>
      <button style={s.priorPrsHeader} onClick={() => setOpen((o) => !o)}>
        <Icon.Clock size={13} style={{ color: "var(--text-muted)" }} />
        <span style={s.priorPrsTitle}>{t("blastRadius.priorPrs.title")}</span>
        <span style={s.priorPrsCount}>{data.history.length}</span>
        <Icon.ChevronDown size={14} style={s.priorPrsChevron(open)} />
      </button>
      {open && (
        <div style={s.priorPrsList}>
          {data.history.map((item) => (
            <PriorPrRow key={item.pr_number} item={item} repoFullName={repoFullName} />
          ))}
        </div>
      )}
    </div>
  );
}

function PriorPrRow({
  item,
  repoFullName,
}: {
  item: PrHistoryItem;
  repoFullName: string | null;
}) {
  // Always links to GitHub's PR page — works whether the PR is open, closed,
  // or merged, since GitHub renders the right state either way.
  const href = repoFullName ? githubPrUrl(repoFullName, item.pr_number) : undefined;
  return (
    <div style={s.priorPrRow}>
      <a
        href={href}
        target={href ? "_blank" : undefined}
        rel={href ? "noopener noreferrer" : undefined}
        style={s.priorPrHeader}
      >
        <span style={s.priorPrNumber}>#{item.pr_number}</span>
        <span style={s.priorPrPrTitle}>{item.title}</span>
      </a>
      <div style={s.priorPrMeta}>
        {item.author}
        {item.merged_at ? ` · ${relativeTime(item.merged_at)}` : ""}
      </div>
      <div style={s.priorPrNotes}>{item.notes}</div>
    </div>
  );
}
