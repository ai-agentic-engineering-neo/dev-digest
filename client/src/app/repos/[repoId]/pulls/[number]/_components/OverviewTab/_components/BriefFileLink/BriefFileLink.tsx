"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { OpenDiffTarget } from "@/components/diff-viewer";
import { shortenPath } from "@/lib/context-docs";
import { briefRefHref, fileLocation } from "./helpers";
import { s } from "./styles";

const SHORT_PATH_MAX = 48;

/**
 * A file reference of the brief. In the diff -> button (opens Files changed at the line/range); blast-only ->
 * GitHub link pinned to the indexed commit; without repo/sha -> plain text. `label` is built by the caller.
 */
export function BriefFileLink({
  path,
  line,
  endLine,
  inDiff,
  repoFullName,
  linkSha,
  onOpenFile,
  label,
  reason,
}: {
  path: string;
  line: number | null;
  endLine?: number | null;
  inDiff: boolean;
  repoFullName: string | null;
  linkSha: string | null;
  onOpenFile: OpenDiffTarget;
  label: string;
  reason?: string;
}) {
  const t = useTranslations("brief");
  const [hovered, setHovered] = useState(false);
  const location = fileLocation(path, line);
  const shown = label.includes(path) ? label.replace(path, shortenPath(path, SHORT_PATH_MAX)) : label;
  const href = inDiff ? null : briefRefHref(path, line, repoFullName, linkSha);

  // The reason is a plain ICU argument (rendered as text, never HTML); the `r` tag only styles it secondary.
  const content: ReactNode =
    reason === undefined
      ? shown
      : t.rich("link.withReason", {
          location: shown,
          reason,
          loc: (chunks) => <span className="mono">{chunks}</span>,
          r: (chunks) => <span style={s.reason}>{chunks}</span>,
        });
  const style = hovered ? { ...s.link, ...s.linkHover } : s.link;
  const hoverProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  if (inDiff) {
    return (
      <button
        type="button"
        className="mono"
        title={path}
        aria-label={t("link.openInDiff", { location })}
        onClick={() => onOpenFile(path, line === null ? null : { start: line, end: endLine ?? line })}
        style={style}
        {...hoverProps}
      >
        {content}
      </button>
    );
  }
  if (href) {
    return (
      <a
        className="mono"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={path}
        aria-label={t("link.openOnGithub", { location })}
        style={style}
        {...hoverProps}
      >
        {content}
      </a>
    );
  }
  return (
    <span className="mono" title={path} style={s.text}>
      {content}
    </span>
  );
}
