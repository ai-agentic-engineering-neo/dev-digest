/* ConfigTab — the skill form (name, description, type, body) with Discard and
   Save. Save asks for an optional change note and writes a new version. The
   Enabled toggle is not part of the form; it saves at once. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteSkill, useSetSkillEnabled, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillFields } from "../../../SkillFields";
import { TrustWarning } from "../../../TrustWarning";
import { canSaveDraft, toDraft, type SkillDraft } from "../../../../helpers";
import { nextVersion } from "../../helpers";
import { SaveNoteModal } from "../SaveNoteModal";
import { isUntrusted, serverTokensFor, toSkillPatch } from "./helpers";
import { s } from "./styles";

export function ConfigTab({
  skill,
  draft,
  dirty,
  onChange,
  onDiscard,
  onSaved,
}: {
  skill: Skill;
  draft: SkillDraft;
  dirty: boolean;
  onChange: (patch: Partial<SkillDraft>) => void;
  onDiscard: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const setEnabled = useSetSkillEnabled();
  const del = useDeleteSkill();
  const [noting, setNoting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const save = (note: string) =>
    update.mutate(
      { id: skill.id, patch: toSkillPatch(toDraft(skill), draft, note) },
      {
        onSuccess: (next) => {
          setNoting(false);
          onSaved();
          toast.success(t("config.savedToast", { version: next.version }));
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge icon="GitCommit" mono>
          {t("detail.version", { version: skill.version })}
        </Badge>
        <span style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => setEnabled.mutate({ id: skill.id, enabled })}
            size={16}
            aria-label={t("config.enabledLabel", { name: skill.name })}
          />
        </span>
      </div>
      {isUntrusted(skill) && <TrustWarning />}
      <SkillFields
        value={draft}
        onChange={onChange}
        unsaved={dirty}
        serverTokens={serverTokensFor(skill, draft.body)}
      />
      <div style={s.actions}>
        <Button kind="ghost" onClick={onDiscard} disabled={!dirty}>
          {t("config.discard")}
        </Button>
        <Button
          kind="primary"
          icon="Check"
          disabled={!dirty || !canSaveDraft(draft)}
          onClick={() => {
            update.reset();
            setNoting(true);
          }}
        >
          {t("config.save")}
        </Button>
      </div>
      <div style={s.danger}>
        <Button kind="danger" icon="Trash" onClick={() => setDeleting(true)} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </div>
      {noting && (
        <SaveNoteModal
          version={nextVersion(skill)}
          pending={update.isPending}
          error={update.error?.message ?? null}
          onSave={save}
          onClose={() => setNoting(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("config.deleteTitle")}
          message={t("config.deleteConfirm", { name: skill.name, count: skill.agent_count })}
          confirmLabel={t("config.deleteLabel")}
          onConfirm={() => {
            setDeleting(false);
            del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
          }}
          onCancel={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
