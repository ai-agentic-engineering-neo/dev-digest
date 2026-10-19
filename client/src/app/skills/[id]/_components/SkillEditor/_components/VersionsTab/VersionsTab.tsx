/* VersionsTab — every saved body is an immutable snapshot (eval runs stay
   reproducible against the exact text they scored). Each older version can be
   diffed against the current body or restored (restoring saves a NEW version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { diffLines, diffStats, shortDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const [open, setOpen] = React.useState<number | null>(null);

  const restore = (v: SkillVersion) =>
    update.mutate(
      { id: skill.id, patch: { body: v.body, version_message: t("versions.restoredNote", { version: v.version }) } },
      { onSuccess: (saved) => toast.success(t("versions.restored", { version: v.version, next: saved.version })) },
    );

  /** Change note, or "+N / −M lines" against the previous snapshot. */
  const title = (v: SkillVersion, i: number, all: SkillVersion[]) => {
    if (v.message) return v.message;
    const prev = all[i + 1];
    if (!prev) return t("versions.initial");
    const { added, removed } = diffStats(diffLines(prev.body, v.body));
    return t("versions.lineSummary", { added, removed });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {versions && <Badge color="var(--text-muted)">{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      {isLoading && <Skeleton height={64} />}
      {isError && <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />}
      {versions?.map((v, i, all) => {
        const current = v.version === skill.version;
        const isOpen = open === v.version;
        return (
          <div key={v.version} style={s.row}>
            <div style={s.rowMain}>
              <span className="mono" style={s.chip(current)}>
                {t("preview.version", { version: v.version })}
              </span>
              <div style={s.meta}>
                <div style={s.title(!!v.message)}>{title(v, i, all)}</div>
                <div className="mono" style={s.date}>
                  {shortDate(v.created_at)}
                </div>
              </div>
              {current ? (
                <span style={s.current}>
                  <span style={s.dot} />
                  {t("versions.current")}
                </span>
              ) : (
                <div style={s.actions}>
                  <Button
                    kind="ghost"
                    size="sm"
                    icon={isOpen ? "EyeOff" : "Eye"}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : v.version)}
                  >
                    {t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    onClick={() => restore(v)}
                    disabled={update.isPending || v.body === skill.body}
                  >
                    {t("versions.restore")}
                  </Button>
                </div>
              )}
            </div>
            {isOpen && !current && (
              <div style={s.diff}>
                <div className="mono" style={s.diffHead}>
                  {t("versions.diffHead", { from: v.version, to: skill.version })}
                </div>
                <pre className="mono" style={s.diffBody}>
                  {diffLines(v.body, skill.body).map((d, k) => (
                    <div key={k} style={s.diffLine(d.op)}>
                      {d.op === "add" ? "+ " : d.op === "del" ? "- " : "  "}
                      {d.text}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
