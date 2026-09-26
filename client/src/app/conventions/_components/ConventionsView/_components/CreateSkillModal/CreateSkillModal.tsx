/* CreateSkillModal — turns the accepted conventions into a skill. The server
   builds the draft (name, description, body); the form initialises from it
   once it has loaded (no effect-based state sync), every field is editable,
   and nothing is saved until "Create skill". */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, FormField, Modal, SelectInput, Skeleton, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Agent, ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { useAgents } from "../../../../../../lib/hooks/agents";
import { useConventionSkillDraft, useCreateConventionSkill } from "../../../../../../lib/hooks/conventions";
import { useToast } from "../../../../../../lib/toast";
import { SKILL_TYPE_VALUES } from "../../../../../../components/skill-type-tag";
import { approxTokens } from "../../helpers";
import { preferredAgentId } from "./helpers";
import { s } from "./styles";

const MODAL_WIDTH = 720;

function DraftForm({
  repoId,
  repoName,
  draft,
  agents,
  onClose,
}: {
  repoId: string;
  repoName: string;
  draft: ConventionSkillDraft;
  agents: Agent[] | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const ts = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateConventionSkill();
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  // The user's explicit pick; until then the preferred agent is derived in render.
  const [pickedAgentId, setPickedAgentId] = React.useState("");
  const agentId = pickedAgentId || preferredAgentId(agents);

  const submit = async () => {
    const { skill } = await create.mutateAsync({ repoId, name: name.trim(), description, type, body, enabled, agent_id: agentId });
    toast.success(t("modal.createdToast", { name: skill.name, version: skill.version }));
    onClose();
    router.push(`/skills?skill=${skill.id}`);
  };

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: ts(`card.type.${v}`) }));
  const agentOptions = (agents ?? []).map((a) => ({ value: a.id, label: a.name }));
  const ready = !!agentId && !!name.trim() && !!body.trim();

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>{t("modal.footerNote")}</span>
          <span style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!ready || create.isPending}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.form}>
        <div style={s.banner}>
          {t("modal.banner", { count: draft.accepted_count, repo: repoName })}
          {draft.existing_skill_id && <div style={s.existing}>{t("modal.existing", { name: draft.name })}</div>}
        </div>
        <FormField label={t("modal.name")} hint={t("modal.nameHint")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("modal.description")} hint={t("modal.descriptionHint")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <div style={s.twoCol}>
          <FormField label={t("modal.type")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
          </FormField>
          <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
            <label style={s.toggleRow}>
              <Toggle on={enabled} onChange={setEnabled} size={16} />
            </label>
          </FormField>
        </div>
        <FormField label={t("modal.agent")} hint={t("modal.agentHint")} required>
          <SelectInput value={agentId} onChange={setPickedAgentId} options={agentOptions} mono={false} />
        </FormField>
        <FormField
          label={t("modal.body")}
          required
          right={
            <span className="mono" style={s.bodyMeta}>
              {name || draft.name}.md · {t("modal.tokens", { count: approxTokens(body) })}
            </span>
          }
        >
          <Textarea value={body} onChange={setBody} rows={16} mono placeholder={draft.body} />
        </FormField>
      </div>
    </Modal>
  );
}

export function CreateSkillModal({ repoId, repoName, onClose }: { repoId: string; repoName: string; onClose: () => void }) {
  const t = useTranslations("conventions");
  const draft = useConventionSkillDraft(repoId);
  const { data: agents } = useAgents();

  if (draft.data) return <DraftForm repoId={repoId} repoName={repoName} draft={draft.data} agents={agents} onClose={onClose} />;
  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
        </div>
      }
    >
      <div style={s.loading}>
        {draft.isError ? <ErrorState body={t("modal.loadError")} onRetry={() => draft.refetch()} /> : <Skeleton height={200} />}
      </div>
    </Modal>
  );
}
