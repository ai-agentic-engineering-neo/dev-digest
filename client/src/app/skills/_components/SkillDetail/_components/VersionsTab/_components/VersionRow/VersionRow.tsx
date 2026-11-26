/* VersionRow — one snapshot card: v chip · message · date · [Current] [Diff] [Restore].
   Diff (any version with a predecessor) expands the line diff against the PREVIOUS
   version inline; Restore is on every non-current version. */
"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { SkillVersion } from "@devdigest/shared";
import { NO_VALUE } from "@/lib/format";
import { formatDay } from "../../helpers";
import { VersionDiff } from "../VersionDiff";
import { s } from "./styles";

export function VersionRow({
  version,
  previous,
  isCurrent,
  onRestore,
}: {
  version: SkillVersion;
  /** The version right before this one; absent for v1, which has nothing to diff against. */
  previous?: SkillVersion;
  isCurrent: boolean;
  onRestore: (version: SkillVersion) => void;
}) {
  const t = useTranslations("skills.versions");
  const [open, setOpen] = useState(false);
  const diffId = useId();
  return (
    <li style={s.row}>
      <div style={s.top}>
        <Badge mono color="var(--accent)" bg="var(--accent-bg)">
          {t("chip", { version: version.version })}
        </Badge>
        <span style={s.message}>{version.message || NO_VALUE}</span>
        <time className="mono" style={s.date} dateTime={version.created_at}>
          {formatDay(version.created_at)}
        </time>
        <span style={s.actions}>
          {isCurrent && (
            <Badge dot color="var(--ok)" bg="var(--ok-bg)">
              {t("current")}
            </Badge>
          )}
          {previous && (
            <Button
              size="sm"
              kind="ghost"
              active={open}
              aria-expanded={open}
              aria-controls={diffId}
              onClick={() => setOpen((value) => !value)}
            >
              {t("diff")}
            </Button>
          )}
          {!isCurrent && (
            <Button size="sm" kind="secondary" icon="History" onClick={() => onRestore(version)}>
              {t("restore")}
            </Button>
          )}
        </span>
      </div>
      {previous && open && (
        <VersionDiff
          id={diffId}
          fromVersion={previous.version}
          fromBody={previous.body}
          toVersion={version.version}
          toBody={version.body}
        />
      )}
    </li>
  );
}
