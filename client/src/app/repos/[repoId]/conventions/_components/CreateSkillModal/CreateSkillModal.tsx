/* Create-skill modal for the accepted conventions. It explains what is being created,
   preloads the server-built draft (name, description, type and the full Markdown BODY),
   and lets the user edit ALL of it before saving. Save upserts the `repo-conventions`
   skill by name (a second save adds a version) and links it additively to the chosen agent
   (default: the first enabled agent). Cancel / Create / X. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Skeleton, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionSkillDraft, ConventionSkillResult, SkillType } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionSkillDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { BODY_ROWS, MODAL_WIDTH, SKILL_TYPES } from "./constants";
import { s } from "./styles";

export interface CreateSkillModalProps {
  repoId: string;
  acceptedCount: number;
  onClose: () => void;
  /** Called with the saved skill (after the toast) so the page can link to /skills. */
  onCreated: (result: ConventionSkillResult) => void;
}

export function CreateSkillModal({ repoId, acceptedCount, onClose, onCreated }: CreateSkillModalProps) {
  const t = useTranslations("conventions.modal");
  const { data: draft, isLoading, isError } = useConventionSkillDraft(repoId);

  if (draft) {
    return (
      <DraftForm
        key={draft.name}
        repoId={repoId}
        draft={draft}
        acceptedCount={acceptedCount}
        onClose={onClose}
        onCreated={onCreated}
      />
    );
  }

  return (
    <Modal width={MODAL_WIDTH} title={t("title")} onClose={onClose}>
      {isLoading && (
        <div style={s.panel}>
          <Skeleton height={44} />
          <Skeleton height={260} />
        </div>
      )}
      {isError && (
        <div style={s.panel} role="alert">
          {t("loadFailed")}
        </div>
      )}
    </Modal>
  );
}

function DraftForm({
  repoId,
  draft,
  acceptedCount,
  onClose,
  onCreated,
}: CreateSkillModalProps & { draft: ConventionSkillDraft }) {
  const t = useTranslations("conventions.modal");
  const toast = useToast();
  const { data: agents } = useAgents();
  const create = useCreateConventionSkill();

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [body, setBody] = React.useState(draft.body);
  // null = untouched: fall back to the first enabled agent once the list loads.
  const [agentChoice, setAgentChoice] = React.useState<string | null>(null);

  const agentList = agents ?? [];
  const agentId = agentChoice ?? agentList.find((a) => a.enabled)?.id ?? "";
  const canCreate = name.trim().length > 0 && body.trim().length > 0 && !create.isPending;

  const submit = async () => {
    try {
      const result = await create.mutateAsync({
        repoId,
        body: {
          name: name.trim(),
          description: description.trim(),
          type,
          body,
          agent_id: agentId || null,
        },
      });
      const vars = { name: result.skill.name, version: result.skill.version };
      toast.success(t(result.linked ? "savedLinked" : "saved", vars));
      if (result.skill.injection_detected) toast.error(t("blocked", vars));
      onCreated(result);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("saveFailed"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={create.isPending}>
            {t("cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canCreate} loading={create.isPending}>
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      }
    >
      <div style={s.panel}>
        <p style={s.intro}>{t("intro", { count: acceptedCount })}</p>

        <FormField label={t("name")} required>
          <TextInput value={name} onChange={setName} aria-label={t("name")} mono />
        </FormField>
        <FormField label={t("description")}>
          <TextInput value={description} onChange={setDescription} aria-label={t("description")} />
        </FormField>
        <div style={s.twoCol}>
          <div style={s.col}>
            <FormField label={t("type")}>
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                mono={false}
                options={SKILL_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
              />
            </FormField>
          </div>
          <div style={s.col}>
            <FormField label={t("agent")} hint={t("agentHint")}>
              <SelectInput
                value={agentId}
                onChange={setAgentChoice}
                mono={false}
                options={[
                  { value: "", label: t("noAgent") },
                  ...agentList.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </FormField>
          </div>
        </div>
        <FormField label={t("body")} hint={t("bodyHint")} required>
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
      </div>
    </Modal>
  );
}
