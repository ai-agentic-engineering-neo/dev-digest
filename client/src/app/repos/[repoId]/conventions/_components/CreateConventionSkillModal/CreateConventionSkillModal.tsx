/* CreateConventionSkillModal — the accepted conventions merged into one
   editable skill draft (name, description, enabled, Markdown body). Saving
   creates a `convention` skill with source `extracted`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { useCreateConventionSkill } from "@/lib/hooks/conventions";
import { evidenceLocation } from "../../helpers";
import { DEFAULT_SKILL_NAME, MODAL_WIDTH } from "./constants";
import { buildSkillBody, canSaveSkillDraft, type ConventionSkillDraft } from "./helpers";
import { s } from "./styles";

export interface CreateConventionSkillModalProps {
  repoId: string;
  repoName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}

export function CreateConventionSkillModal({ repoId, repoName, accepted, onClose, onCreated }: CreateConventionSkillModalProps) {
  const t = useTranslations("conventions");
  const create = useCreateConventionSkill(repoId);
  const [draft, setDraft] = React.useState<ConventionSkillDraft>(() => ({
    name: DEFAULT_SKILL_NAME,
    description: t("modal.defaultDescription", { count: accepted.length, repo: repoName }),
    body: buildSkillBody(
      DEFAULT_SKILL_NAME,
      accepted,
      accepted.map(evidenceLocation),
      { intro: t("modal.bodyIntro"), detectedIn: (location) => t("modal.detectedIn", { location }) },
    ),
    enabled: false,
  }));
  const patch = (p: Partial<ConventionSkillDraft>) => setDraft((d) => ({ ...d, ...p }));

  const submit = () =>
    create.mutate(
      { ...draft, convention_ids: accepted.map((c) => c.id) },
      { onSuccess: (skill) => onCreated(skill) },
    );

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: accepted.length, repo: repoName })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            loading={create.isPending}
            disabled={!canSaveSkillDraft(draft)}
            onClick={submit}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {create.error && (
          <div role="alert" style={s.error}>
            {create.error.message}
          </div>
        )}
        <FormField label={t("modal.name")} hint={t("modal.nameHint")} required>
          <TextInput mono value={draft.name} onChange={(name) => patch({ name })} />
        </FormField>
        <FormField label={t("modal.description")} required>
          <TextInput value={draft.description} onChange={(description) => patch({ description })} />
        </FormField>
        <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
          <Toggle on={draft.enabled} onChange={(enabled) => patch({ enabled })} aria-label={t("modal.enabled")} />
        </FormField>
        <FormField label={t("modal.body")} required>
          <SkillBodyEditor name={draft.name} value={draft.body} onChange={(body) => patch({ body })} />
        </FormField>
      </div>
    </Modal>
  );
}
