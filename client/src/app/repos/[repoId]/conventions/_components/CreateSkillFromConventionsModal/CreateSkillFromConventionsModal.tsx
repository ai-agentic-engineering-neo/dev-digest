/* CreateSkillFromConventionsModal — turn the selected accepted conventions into
   a NEW skill (type convention, source extracted, disabled by default). Name and
   description come from the server draft and are editable; the body is a
   read-only preview (edited on the skill page, where Create lands). A taken
   name links to the existing skill. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { useSkills } from "@/lib/hooks/skills";
import { SKILL_DESCRIPTION_MAX, SKILL_TYPES } from "../../constants";
import { isValidSkillName, skillConfigHref } from "../../helpers";
import { previewBody } from "./helpers";
import { s } from "./styles";

export interface CreateSkillFromConventionsModalProps {
  repoId: string;
  repoName: string;
  conventionIds: string[];
  onClose: () => void;
}

export function CreateSkillFromConventionsModal(props: CreateSkillFromConventionsModalProps) {
  const t = useTranslations("conventions");
  const draft = useConventionSkillDraft(props.repoId, props.conventionIds, true);

  return (
    <Modal width={760} title={t("create.title")} subtitle={draft.data?.name} onClose={props.onClose}>
      {draft.isLoading ? (
        <p style={s.muted}>{t("create.loadingDraft")}</p>
      ) : draft.isError || !draft.data ? (
        <p style={s.error}>{t("create.draftError")}</p>
      ) : (
        // Keyed so a new draft re-seeds the form instead of syncing it in an effect.
        <CreateForm key={draft.data.name} {...props} draft={draft.data} />
      )}
    </Modal>
  );
}

function CreateForm({
  repoId,
  repoName,
  conventionIds,
  onClose,
  draft,
}: CreateSkillFromConventionsModalProps & { draft: ConventionSkillDraft }) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkillFromConventions(repoId);
  const skills = useSkills();
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(false);
  const [takenName, setTakenName] = React.useState<string | null>(null);

  const nameValid = isValidSkillName(name);
  const taken = takenName === name;
  const existing = taken ? skills.data?.find((sk) => sk.name === name) : undefined;

  const submit = async () => {
    if (!nameValid || taken) return;
    try {
      const { skill } = await create.mutateAsync({
        convention_ids: conventionIds,
        name,
        description: description.slice(0, SKILL_DESCRIPTION_MAX),
        type,
        enabled,
      });
      toast.success(t("create.createdToast", { name: skill.name }));
      onClose();
      router.push(skillConfigHref(skill.id));
    } catch (err) {
      // Other failures are toasted by the global MutationCache (lib/providers.tsx).
      if (err instanceof ApiError && err.status === 409) setTakenName(name);
    }
  };

  return (
    <div style={s.body}>
      <div style={s.banner}>
        {t("create.banner", { count: conventionIds.length, repo: repoName })}
      </div>

      <FormField label={t("create.name")} required hint={t("create.nameHint")}>
        <TextInput mono value={name} onChange={setName} aria-label={t("create.name")} />
        {!nameValid && <p style={s.error}>{t("create.nameInvalid")}</p>}
        {taken && (
          <p style={s.error} role="alert">
            {t("create.nameTaken", { name })}{" "}
            {existing && (
              <Link href={skillConfigHref(existing.id)} style={s.link}>
                {t("create.openExisting")}
              </Link>
            )}
          </p>
        )}
      </FormField>

      <FormField label={t("create.description")}>
        <TextInput value={description} onChange={setDescription} aria-label={t("create.description")} />
      </FormField>

      <div style={s.row}>
        <div style={s.col}>
          <FormField label={t("create.type")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={[...SKILL_TYPES]} />
          </FormField>
        </div>
        <div style={s.col}>
          <FormField label={t("create.enabled")} hint={t("create.enabledHint")}>
            <Toggle on={enabled} onChange={setEnabled} />
          </FormField>
        </div>
      </div>

      <FormField label={t("create.body")}>
        <div style={s.preview}>
          <div style={s.previewHead}>
            <span style={s.previewName}>{name || draft.name}.md</span>
            <span style={s.readOnly}>{t("create.readOnly")}</span>
            <span style={s.tokens}>{t("create.tokens", { count: draft.tokens })}</span>
          </div>
          <pre style={s.previewBody} aria-label={t("create.body")}>
            {previewBody(draft.body, name || draft.name)}
          </pre>
        </div>
      </FormField>

      <div style={s.footer}>
        <span style={s.muted}>{t("create.footer")}</span>
        <div style={s.footerActions}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            loading={create.isPending}
            disabled={!nameValid || taken}
            onClick={submit}
          >
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}
