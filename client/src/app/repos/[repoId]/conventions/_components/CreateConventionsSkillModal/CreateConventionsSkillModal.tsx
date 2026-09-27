/* CreateConventionsSkillModal — turn the accepted rules into a skill.
   The body is rendered by the server and then handed over: what the user
   confirms here is byte-for-byte what an agent's prompt will carry, so every
   field, including the text itself, is editable before Create. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { ConventionsSkillPreview, Skill, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgents } from "@/lib/hooks/agents";
import { MarkdownEditor } from "@/app/skills/_components/MarkdownEditor";
import { SKILL_TYPES } from "@/app/skills/constants";
import {
  useCreateConventionsSkill,
  usePreviewConventionsSkill,
} from "@/lib/hooks/conventions";
import { s } from "./styles";

export function CreateConventionsSkillModal({
  repoId,
  repoFullName,
  candidateIds,
  onClose,
  onCreated,
}: {
  repoId: string;
  repoFullName?: string | null;
  candidateIds: string[];
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const preview = usePreviewConventionsSkill(repoId);
  const create = useCreateConventionsSkill(repoId);
  const { data: agents } = useAgents();

  const [loaded, setLoaded] = React.useState<ConventionsSkillPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [agentId, setAgentId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // One preview per open. `mutateAsync` in an effect rather than a query: this
  // is a POST, and it must not re-run and overwrite an edit in progress.
  const run = preview.mutateAsync;
  React.useEffect(() => {
    let cancelled = false;
    run(candidateIds)
      .then((p) => {
        if (cancelled) return;
        setLoaded(p);
        setName(p.name);
        setDescription(p.description);
        setType(p.type);
        setBody(p.body);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t("modal.previewFailed"));
      });
    return () => {
      cancelled = true;
    };
    // candidateIds is a fresh array each render; its CONTENT is the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, candidateIds.join(","), run]);

  const submit = async () => {
    setError(null);
    try {
      const skill = await create.mutateAsync({
        candidate_ids: candidateIds,
        name: name.trim(),
        description: description.trim(),
        type,
        body,
        enabled,
        ...(agentId ? { agent_id: agentId } : {}),
      });
      onCreated?.(skill);
      onClose();
    } catch (err) {
      // Thrown from an event handler, so no error boundary would ever see it.
      setError(err instanceof ApiError ? err.message : t("modal.createFailed"));
    }
  };

  const agentOptions = [
    { value: "", label: t("modal.noAgent") },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <Modal
      width={860}
      title={t("modal.title")}
      subtitle={name || t("modal.subtitleFallback")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("modal.savedAs")}
          </span>
          <Button kind="ghost" onClick={onClose} disabled={create.isPending}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={create.isPending || !loaded || !name.trim() || !body.trim()}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}

        <div style={s.banner}>
          <Icon.Wrench size={15} />
          <span>
            {t("modal.mergedFrom", {
              count: candidateIds.length,
              repo: repoFullName ?? t("page.repoFallback"),
            })}
          </span>
        </div>

        {!loaded ? (
          <div style={s.loading}>
            <Skeleton height={38} />
            <Skeleton height={38} />
            <Skeleton height={220} />
          </div>
        ) : (
          <>
            <FormField label={tSkills("config.name")} hint={tSkills("config.nameHint")} required>
              <TextInput value={name} onChange={setName} />
            </FormField>

            <FormField
              label={tSkills("config.description")}
              hint={tSkills("config.descriptionHint")}
            >
              <TextInput value={description} onChange={setDescription} />
            </FormField>

            <div style={s.row}>
              <FormField label={tSkills("config.type")}>
                <SelectInput
                  value={type}
                  onChange={(v) => setType(v as SkillType)}
                  options={SKILL_TYPES.map((v) => ({
                    value: v,
                    label: tSkills(`listItem.type.${v}`),
                  }))}
                />
              </FormField>

              <FormField label={t("modal.linkAgent")} hint={t("modal.linkAgentHint")}>
                <SelectInput value={agentId} onChange={setAgentId} options={agentOptions} />
              </FormField>

              <FormField label={tSkills("config.enabled")} hint={t("modal.enabledHint")}>
                <Toggle on={enabled} onChange={setEnabled} />
              </FormField>
            </div>

            <FormField label={t("modal.body")} hint={t("modal.bodyHint")} required>
              <MarkdownEditor
                filename={`${name || "repo-conventions"}.md`}
                value={body}
                onChange={setBody}
                dirty={body !== loaded.body}
                rows={14}
              />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
