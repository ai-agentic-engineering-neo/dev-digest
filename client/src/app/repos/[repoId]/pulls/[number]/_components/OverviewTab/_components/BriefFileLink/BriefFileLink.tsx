"use client";

import { useTranslations } from "next-intl";
import { shortenPath } from "@/lib/context-docs";
import { githubBlobUrl } from "@/lib/github-urls";
import { fileLocation } from "./helpers";
import { s } from "./styles";

const SHORT_PATH_MAX = 48;

/**
 * A file reference of the brief. In the diff -> button (opens Files changed); blast-only -> GitHub
 * link pinned to the indexed commit; without repo/sha -> plain text. `label` is built by the caller.
 */
export function BriefFileLink({
  path,
  line,
  inDiff,
  repoFullName,
  linkSha,
  onOpenFile,
  label,
}: {
  path: string;
  line: number | null;
  inDiff: boolean;
  repoFullName: string | null;
  linkSha: string | null;
  onOpenFile: (path: string) => void;
  label: string;
}) {
  const t = useTranslations("brief");
  const location = fileLocation(path, line);
  const shown = label.includes(path) ? label.replace(path, shortenPath(path, SHORT_PATH_MAX)) : label;

  if (inDiff) {
    return (
      <button
        type="button"
        className="mono"
        title={path}
        aria-label={t("link.openInDiff", { location })}
        onClick={() => onOpenFile(path)}
        style={s.link}
      >
        {shown}
      </button>
    );
  }
  if (repoFullName && linkSha) {
    return (
      <a
        className="mono"
        href={githubBlobUrl(repoFullName, linkSha, path, line ?? undefined)}
        target="_blank"
        rel="noopener noreferrer"
        title={path}
        aria-label={t("link.openOnGithub", { location })}
        style={s.link}
      >
        {shown}
      </a>
    );
  }
  return (
    <span className="mono" title={path} style={s.text}>
      {shown}
    </span>
  );
}
