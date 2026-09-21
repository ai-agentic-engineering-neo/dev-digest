/* ReviewFocusList — the ordered REVIEW FOCUS list (AC-38). Each entry is a
   REASON TO LOOK, never an asserted defect (D3) — rendered as an ordered
   list, each with its file ref and one-sentence reason. AC-39: activating an
   entry switches to the Files tab and opens/scrolls that file (and line,
   when one survived) via `onFocusFile`; falls back to a repository-host link
   pinned to the brief's OWN provenance head sha when no in-app target is
   available (missing repo/head-sha context, or no `onFocusFile` wired). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function ReviewFocusList({
  items,
  repoFullName,
  headSha,
  onFocusFile,
}: {
  items: ReviewFocusItem[];
  repoFullName?: string | null;
  headSha?: string | null;
  onFocusFile?: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");

  if (items.length === 0) {
    return <p style={s.prose}>{t("focus.empty")}</p>;
  }

  return (
    <ol style={s.focusList}>
      {items.map((item, i) => {
        const label = item.line != null ? `${item.file}:${item.line}` : item.file;
        const canFocusInApp = !!onFocusFile;
        return (
          <li key={`${item.file}:${item.line}:${i}`} style={s.focusItem}>
            {canFocusInApp ? (
              <button type="button" style={s.focusButton} onClick={() => onFocusFile!(item.file, item.line)}>
                <span className="mono">{label}</span>
              </button>
            ) : (
              <MonoLink
                href={repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, item.file, item.line ?? undefined, item.line ?? undefined) : undefined}
              >
                {label}
              </MonoLink>
            )}
            <span style={s.focusReason}>{item.reason}</span>
          </li>
        );
      })}
    </ol>
  );
}
