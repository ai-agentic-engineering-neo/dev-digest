/* VersionDiffModal — an older version against the current saved skill: changed
   name/description/type as `old → new` rows, and the body as a line diff in the
   shared DiffViewer. Loads the old version when it opens. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { useSkillVersion } from "@/lib/hooks/skills";
import { toDraft } from "../../../../helpers";
import { MODAL_WIDTH } from "./constants";
import { fieldChanges, lineDiffToPatch } from "./helpers";
import { s } from "./styles";

export function VersionDiffModal({ skill, version, onClose }: { skill: Skill; version: number; onClose: () => void }) {
  const t = useTranslations("skills");
  const { data: older, isLoading, isError } = useSkillVersion(skill.id, version);
  const changes = older ? fieldChanges(toDraft(older), toDraft(skill)) : [];
  const body = older ? lineDiffToPatch(older.body, skill.body) : null;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("diff.title", { old: version, current: skill.version })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("diff.close")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {isLoading && <Skeleton height={160} />}
        {isError && (
          <div role="alert" style={s.error}>
            {t("diff.loadError", { version })}
          </div>
        )}
        {changes.map((c) => (
          <div key={c.field} style={s.fieldRow}>
            <span style={s.fieldLabel}>{t(`diff.fields.${c.field}`)}</span>
            <span style={s.from}>{c.from}</span>
            <span style={s.arrow}>→</span>
            <span style={s.to}>{c.to}</span>
          </div>
        ))}
        {older &&
          (body ? (
            <DiffViewer
              files={[
                { path: `${skill.name}.md`, additions: body.additions, deletions: body.deletions, patch: body.patch },
              ]}
            />
          ) : (
            <span style={s.muted}>{t("diff.bodyUnchanged")}</span>
          ))}
      </div>
    </Modal>
  );
}
