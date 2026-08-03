/* CreateSkillModal — merges the accepted candidates into one skill. Name,
   description, body and enabled are all pre-filled but editable before save,
   per the assignment's "edit the future skill's text and metadata" step. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, Textarea, Toggle, Modal } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { SKILL_NAME_RE } from "@devdigest/shared/contracts/knowledge";
import type { CreateSkillFromConventionsInput } from "@/lib/hooks/conventions";
import { renderConventionsSkillBodyPreview, suggestSkillName } from "./helpers";

export function CreateSkillModal({
  repoName,
  candidates,
  onClose,
  onCreate,
  saving,
}: {
  repoName: string;
  candidates: ConventionCandidate[];
  onClose: () => void;
  onCreate: (input: CreateSkillFromConventionsInput) => void | Promise<void>;
  saving?: boolean;
}) {
  const t = useTranslations("conventions");
  const [name, setName] = React.useState(() => suggestSkillName(repoName));
  const [description, setDescription] = React.useState(
    () =>
      `${candidates.length} house convention${candidates.length === 1 ? "" : "s"} extracted from ${repoName}`,
  );
  const [enabled, setEnabled] = React.useState(false);
  const [body, setBody] = React.useState(() => renderConventionsSkillBodyPreview(name, candidates));
  const [bodyTouched, setBodyTouched] = React.useState(false);

  // Keep the body preview in sync with the name heading until the user edits
  // the body directly — after that, their edits are never overwritten.
  React.useEffect(() => {
    if (!bodyTouched) setBody(renderConventionsSkillBodyPreview(name, candidates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const nameValid = SKILL_NAME_RE.test(name);

  return (
    <Modal
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: candidates.length, repo: repoName })}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            loading={saving}
            disabled={!nameValid || !description.trim() || candidates.length === 0}
            onClick={() =>
              onCreate({
                convention_ids: candidates.map((c) => c.id),
                name,
                description,
                enabled,
                body,
              })
            }
          >
            {saving ? t("modal.saving") : t("modal.save")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: 24 }}>
        <FormField
          label={t("modal.nameLabel")}
          required
          hint={!nameValid && name.length > 0 ? t("modal.nameInvalid") : t("modal.nameHint")}
        >
          <TextInput mono value={name} onChange={setName} placeholder={t("modal.namePlaceholder")} />
        </FormField>

        <FormField label={t("modal.descriptionLabel")} required>
          <TextInput value={description} onChange={setDescription} />
        </FormField>

        <FormField label={t("modal.enabledLabel")} hint={t("modal.enabledHint")}>
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </FormField>

        <FormField label={t("modal.bodyLabel")}>
          <Textarea
            mono
            rows={14}
            value={body}
            onChange={(v) => {
              setBodyTouched(true);
              setBody(v);
            }}
          />
        </FormField>
      </div>
    </Modal>
  );
}
