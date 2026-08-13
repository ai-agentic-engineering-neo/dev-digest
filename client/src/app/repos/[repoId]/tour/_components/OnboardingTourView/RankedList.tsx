"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingEntry } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

/**
 * Shared by the critical-paths and reading-path sections (AC-26): each entry
 * is one repo file path + one sentence, in the SERVER's order — this
 * component renders order as given, never re-sorts (AC-27 is enforced
 * server-side; re-sorting here would silently defeat it). "Open" navigates to
 * the file on the repository host at the tour's indexed revision (AC-44,
 * N6 — no in-app file viewer). When `entry.chain` is present (critical
 * paths), the remaining hops render as INERT breadcrumb text, never links —
 * only the root (`entry.path`) is the entry's subject.
 */
export function RankedList({
  entries,
  repoFullName,
  indexSha,
}: {
  entries: OnboardingEntry[];
  repoFullName: string | null | undefined;
  indexSha: string;
}) {
  const t = useTranslations("onboarding");
  if (entries.length === 0) {
    return <p style={s.empty}>{t("section.noEntries")}</p>;
  }
  return (
    <ol style={s.rankedList}>
      {entries.map((entry, i) => (
        <li key={entry.path} style={s.rankedRow}>
          <span className="tnum" style={s.rankedPosition}>
            {i + 1}
          </span>
          <div style={s.rankedBody}>
            <div style={s.rankedPathRow}>
              <span className="mono" style={s.rankedPath}>
                {entry.path}
              </span>
              {repoFullName && (
                <a
                  href={githubBlobUrl(repoFullName, indexSha, entry.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.rankedOpenLink}
                >
                  {t("section.openOnGithub")}
                  <Icon.ExternalLink size={11} />
                </a>
              )}
            </div>
            {entry.reason && <span style={s.rankedReason}>{entry.reason}</span>}
            {entry.chain && entry.chain.length > 0 && (
              <span style={s.rankedChain}>
                {[entry.path, ...entry.chain].join(" → ")}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
