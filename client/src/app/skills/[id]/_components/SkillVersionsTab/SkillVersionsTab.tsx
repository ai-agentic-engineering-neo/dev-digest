/* SkillVersionsTab — the body history of one skill, with a diff of any version
   against the current body and a one-click restore. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../lib/hooks/skills";
import { diffLines, diffStats } from "./helpers";
import { s } from "./styles";

export function SkillVersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();

  const [openDiff, setOpenDiff] = React.useState<number | null>(null);

  const restore = async (version: number, body: string) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    // Restoring writes the old text as a NEW version rather than rewinding the
    // history: the body you had a moment ago stays recoverable, so a restore is
    // never itself a way to lose work.
    await update.mutateAsync({ id: skill.id, patch: { body } });
    setOpenDiff(null);
  };

  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => void refetch()} />;
  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={140} />
      </div>
    );
  }

  const list = versions ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.heading")}</h2>
        <Badge color="var(--text-muted)">{t("versions.count", { count: list.length })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      {list.length === 0 ? (
        <p style={s.empty}>{t("versions.empty")}</p>
      ) : (
        <ul style={s.list}>
          {list.map((v) => {
            const isCurrent = v.version === skill.version;
            const open = openDiff === v.version;
            return (
              <li key={v.version} style={s.row(isCurrent)}>
                <div style={s.rowHead}>
                  <Badge color={isCurrent ? "var(--accent)" : "var(--text-muted)"} mono>
                    {t("preview.version", { version: v.version })}
                  </Badge>
                  <span className="tnum" style={s.date}>
                    {v.created_at.slice(0, 10)}
                  </span>
                  {isCurrent && <Badge color="var(--ok)">{t("versions.current")}</Badge>}
                  <div style={s.rowActions}>
                    <Button
                      kind="ghost"
                      size="sm"
                      icon="Code"
                      onClick={() => setOpenDiff(open ? null : v.version)}
                    >
                      {open ? t("versions.hideDiff") : t("versions.diff")}
                    </Button>
                    {!isCurrent && (
                      <Button
                        kind="secondary"
                        size="sm"
                        icon="History"
                        onClick={() => restore(v.version, v.body)}
                        disabled={update.isPending}
                      >
                        {update.isPending ? t("versions.restoring") : t("versions.restore")}
                      </Button>
                    )}
                  </div>
                </div>

                {open && <VersionDiff before={v.body} after={skill.body} from={v.version} to={skill.version} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function VersionDiff({
  before,
  after,
  from,
  to,
}: {
  before: string;
  after: string;
  from: number;
  to: number;
}) {
  const t = useTranslations("skills");
  const lines = React.useMemo(() => diffLines(before, after), [before, after]);
  const stats = React.useMemo(() => diffStats(lines), [lines]);
  const identical = stats.added === 0 && stats.removed === 0;

  return (
    <div style={s.diffWrap}>
      <div style={s.diffHead}>
        <span style={{ flex: 1 }}>{t("versions.diffTitle", { version: from, current: to })}</span>
        {!identical && (
          <>
            <span className="tnum" style={s.diffStat("var(--ok)")}>
              +{stats.added}
            </span>
            <span className="tnum" style={s.diffStat("var(--crit)")}>
              −{stats.removed}
            </span>
          </>
        )}
      </div>
      {identical ? (
        <div style={s.identical}>{t("versions.identical")}</div>
      ) : (
        <div style={s.diffBody} className="mono">
          {lines.map((line, i) => (
            <div key={i} style={s.diffLine(line.kind)}>
              <span className="tnum" style={s.gutter}>
                {line.oldNo ?? ""} {line.newNo ?? ""}
              </span>
              <span style={s.sign(line.kind)}>
                {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
              </span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
