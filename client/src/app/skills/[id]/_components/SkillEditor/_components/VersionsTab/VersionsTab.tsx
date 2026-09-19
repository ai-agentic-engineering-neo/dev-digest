"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { CodeLine } from "@/components/diff-viewer";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { diffLines } from "./helpers";
import { s } from "./styles";

/** Versions tab — append-only snapshots, Diff vs current, Restore on older rows. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);

  const selected = versions?.find((v) => v.version === diffVersion);

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      {(versions ?? []).map((v) => {
        const isCurrent = v.version === skill.version;
        return (
          <div key={v.version} style={s.row}>
            <div style={s.meta}>
              <div style={s.version}>
                <span>{`v${v.version}`}</span>
                {isCurrent && (
                  <Badge color="var(--ok)" style={{ marginLeft: 8 }}>
                    {t("versions.current")}
                  </Badge>
                )}
              </div>
              <div style={s.note}>
                {new Date(v.created_at).toLocaleString()}
                {v.note ? ` · ${v.note}` : ""}
              </div>
            </div>
            <div style={s.actions}>
              <Button
                kind="ghost"
                size="sm"
                onClick={() => setDiffVersion((cur) => (cur === v.version ? null : v.version))}
              >
                {t("versions.diff")}
              </Button>
              {!isCurrent && (
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={restore.isPending}
                  onClick={() => {
                    if (!window.confirm(t("versions.restoreConfirm", { version: v.version }))) return;
                    restore.mutate({ id: skill.id, version: v.version });
                  }}
                >
                  {t("versions.restore")}
                </Button>
              )}
            </div>
          </div>
        );
      })}
      {selected && (
        <div style={s.diff}>
          {diffLines(selected.body, skill.body).map((ln, idx) => (
            <CodeLine key={idx} ln={ln} path={skill.name} threads={[]} />
          ))}
        </div>
      )}
    </div>
  );
}
