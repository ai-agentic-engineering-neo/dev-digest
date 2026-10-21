"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { copyText } from "@/lib/clipboard";
import { openUrl, type TourRepoRef } from "./helpers";
import { s } from "./styles";

interface TourPathRowProps {
  path: string;
  why?: string;
  /** Repo of the tour; unknown (not loaded yet) → Open copies the path instead. */
  repo?: TourRepoRef;
  openLabel: string;
  copiedLabel: string;
}

const COPIED_MS = 1500;

/** A file path with an optional rationale and an Open button. */
export function TourPathRow({ path, why, repo, openLabel, copiedLabel }: TourPathRowProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const open = async () => {
    if (repo) {
      window.open(openUrl(repo, path), "_blank", "noopener,noreferrer");
      return;
    }
    if (!(await copyText(path))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div style={s.row}>
      <Icon.FileText size={15} style={s.icon} aria-hidden />
      <div style={s.text}>
        <span className="mono" style={s.path}>
          {path}
        </span>
        {why ? <span style={s.why}> — {why}</span> : null}
      </div>
      <button type="button" style={s.open} onClick={open} aria-label={`${openLabel} ${path}`}>
        {copied ? copiedLabel : openLabel}
      </button>
    </div>
  );
}
