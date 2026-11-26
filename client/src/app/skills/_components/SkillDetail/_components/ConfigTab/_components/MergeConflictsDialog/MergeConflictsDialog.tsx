/* MergeConflictsDialog — after a merge of conventions into this skill, the rules
   that contradict it (not inserted by the server). Per conflict: new rule ↔
   existing text + reason, and Keep existing / Replace with new / Keep both.
   "Apply" only fills the Config form; the user still presses Save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { ConventionMergeConflict } from "@devdigest/shared";
import { DEFAULT_RESOLUTION, RESOLUTIONS, type Resolution } from "./helpers";
import { s } from "./styles";

export interface MergeConflictsDialogProps {
  conflicts: readonly ConventionMergeConflict[];
  onApply: (choices: Record<string, Resolution>) => void;
  onDismiss: () => void;
}

export function MergeConflictsDialog({ conflicts, onApply, onDismiss }: MergeConflictsDialogProps) {
  const t = useTranslations("skills");
  const [choices, setChoices] = React.useState<Record<string, Resolution>>({});
  const choiceOf = (id: string) => choices[id] ?? DEFAULT_RESOLUTION;

  return (
    <Modal
      width={760}
      title={t("conflicts.title", { count: conflicts.length })}
      subtitle={t("conflicts.subtitle")}
      // No onClose: a backdrop click (or the X) would drop the conflicts for good —
      // they live only in the client cache. Only the two footer buttons close it.
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onDismiss}>
            {t("conflicts.dismiss")}
          </Button>
          <Button kind="primary" icon="Check" onClick={() => onApply(choices)}>
            {t("conflicts.apply")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <ol style={s.list}>
          {conflicts.map((c) => (
            <li key={c.convention_id} style={s.item} aria-label={c.rule}>
              <div style={s.reason}>{c.reason || t("conflicts.noReason")}</div>
              <div style={s.sides}>
                <div style={s.side}>
                  <div style={s.sideLabel}>{t("conflicts.existing")}</div>
                  <pre style={s.code}>{c.existing_excerpt || t("conflicts.noExcerpt")}</pre>
                </div>
                <div style={s.side}>
                  <div style={s.sideLabel}>{t("conflicts.incoming")}</div>
                  <pre style={s.code}>{c.rule_block}</pre>
                </div>
              </div>
              <div role="radiogroup" aria-label={t("conflicts.choice")} style={s.choices}>
                {RESOLUTIONS.map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    kind={choiceOf(c.convention_id) === r ? "primary" : "ghost"}
                    role="radio"
                    aria-checked={choiceOf(c.convention_id) === r}
                    onClick={() => setChoices((prev) => ({ ...prev, [c.convention_id]: r }))}
                  >
                    {t(`conflicts.resolution.${r}`)}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
