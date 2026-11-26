/* CreateSkillFromConventionsModal — the selected accepted conventions go into a
   skill. First pick the target (SearchableSelect): a NEW skill (type convention,
   source extracted, disabled by default; name/description from the server
   draft, body a read-only preview) or ONE existing skill (merge: a new version;
   duplicates skipped, conflicts shown on the skill's Config tab). Both land on
   the skill's Config tab. A taken name links to the existing skill. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SearchableSelect, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { useSkills } from "@/lib/hooks/skills";
import { NEW_SKILL_TARGET, SKILL_DESCRIPTION_MAX, SKILL_TYPES } from "../../constants";
import { isValidSkillName, skillConfigHref } from "../../helpers";
import { MergeForm } from "./_components/MergeForm";
import { previewBody } from "./helpers";
import { s } from "./styles";

export interface CreateSkillFromConventionsModalProps {
  repoId: string;
  repoName: string;
  /** The selected accepted conventions. */
  conventions: ConventionCandidate[];
  onClose: () => void;
}

export function CreateSkillFromConventionsModal(props: CreateSkillFromConventionsModalProps) {
  const t = useTranslations("conventions");
  const skills = useSkills();
  const [target, setTarget] = React.useState<string>(NEW_SKILL_TARGET);
  const targetSkill = skills.data?.find((sk) => sk.id === target);
  const options = [
    { value: NEW_SKILL_TARGET, label: t("create.targetNew") },
    ...(skills.data ?? []).map((sk) => ({ value: sk.id, label: sk.name })),
  ];

  return (
    <Modal
      width={760}
      title={targetSkill ? t("merge.title") : t("create.title")}
      subtitle={targetSkill?.name}
      onClose={props.onClose}
    >
      <div style={s.body}>
        <FormField label={t("create.target")} hint={t("create.targetHint")}>
          <SearchableSelect
            value={target}
            onChange={setTarget}
            options={options}
            placeholder={t("create.targetSearch")}
            mono={false}
          />
        </FormField>
        {targetSkill ? (
          <MergeForm key={targetSkill.id} {...props} skill={targetSkill} />
        ) : (
          <NewSkillPane {...props} />
        )}
      </div>
    </Modal>
  );
}

function NewSkillPane(props: CreateSkillFromConventionsModalProps) {
  const t = useTranslations("conventions");
  const ids = props.conventions.map((c) => c.id);
  const draft = useConventionSkillDraft(props.repoId, ids, true);
  if (draft.isLoading) return <p style={s.muted}>{t("create.loadingDraft")}</p>;
  if (draft.isError || !draft.data) return <p style={s.error}>{t("create.draftError")}</p>;
  // Keyed so a new draft re-seeds the form instead of syncing it in an effect.
  return <CreateForm key={draft.data.name} {...props} draft={draft.data} />;
}

function CreateForm({
  repoId,
  repoName,
  conventions,
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
        convention_ids: conventions.map((c) => c.id),
        name,
        description: description.slice(0, SKILL_DESCRIPTION_MAX),
        type,
        enabled,
      });
      toast.success(t("create.createdToast", { name: skill.name }));
      onClose();
      router.push(skillConfigHref(skill.id, { suggestAgents: true }));
    } catch (err) {
      // Other failures are toasted by the global MutationCache (lib/providers.tsx).
      if (err instanceof ApiError && err.status === 409) setTakenName(name);
    }
  };

  return (
    <>
      <div style={s.banner}>
        {t("create.banner", { count: conventions.length, repo: repoName })}
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
            )}{" "}
            {t("create.orPickAbove")}
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
    </>
  );
}
