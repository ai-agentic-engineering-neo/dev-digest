"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, FormField, TextInput, SelectInput, Textarea, Toggle, Button, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useConventionsSkillPreview, useCreateConventionsSkill, useSkillTokenCount } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/lib/skill-display";
import { s } from "./styles";

interface FormState {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
}

const EMPTY: FormState = { name: "repo-conventions", description: "", type: "convention", enabled: true, body: "" };

/**
 * Create-skill modal for the Conventions page. Seeds its form from
 * POST /repos/:id/conventions/skill/preview on mount (writes nothing), then
 * POSTs .../skill on Create. Renders inside a stopPropagation wrapper — Modal
 * itself is not portaled, so a click inside it would otherwise bubble to
 * whatever the caller renders it under (client/INSIGHTS.md).
 */
export function CreateSkillModal({
  repoId,
  repoName,
  acceptedCount,
  onClose,
}: {
  repoId: string;
  repoName: string;
  acceptedCount: number;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const preview = useConventionsSkillPreview(repoId);
  const create = useCreateConventionsSkill(repoId);

  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [nameTakenBy, setNameTakenBy] = React.useState<string | null>(null);
  const [resolution, setResolution] = React.useState<"rename" | "replace">("rename");
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const previewMutate = preview.mutate;
  React.useEffect(() => {
    previewMutate(undefined, {
      onSuccess: (p) => {
        setForm({ name: p.name, description: p.description, type: p.type, enabled: true, body: p.body });
        setNameTakenBy(p.name_taken_by ?? null);
      },
    });
    // Runs once — the modal is mounted only while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { tokens } = useSkillTokenCount(form.body, form.body.length > 0);
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: tSkills(`listItem.type.${v}`) }));

  const submit = () => {
    create.mutate(
      {
        name: form.name,
        description: form.description,
        type: form.type,
        enabled: form.enabled,
        body: form.body,
        replace_skill_id: nameTakenBy && resolution === "replace" ? nameTakenBy : undefined,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("toast.skillCreated", { name: skill.name }));
          onClose();
        },
      },
    );
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Modal
        title={t("modal.title")}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <span style={s.footerNote}>{t("modal.footerNote")}</span>
            <Button kind="ghost" onClick={onClose} disabled={create.isPending}>
              {t("modal.cancel")}
            </Button>
            <Button
              kind="primary"
              icon="Check"
              onClick={submit}
              disabled={create.isPending || !form.name.trim() || !form.body.trim()}
              loading={create.isPending}
            >
              {create.isPending ? t("modal.creating") : t("modal.create")}
            </Button>
          </div>
        }
      >
        <div style={s.banner}>
          <Icon.Wrench size={15} style={s.bannerIcon} />
          <span>
            {t.rich("modal.banner", {
              count: acceptedCount,
              repo: repoName,
              b: (chunks) => <strong style={s.bannerStrong}>{chunks}</strong>,
              code: (chunks) => <code style={s.bannerRepo}>{chunks}</code>,
            })}
          </span>
        </div>
        <div style={s.body}>
          {nameTakenBy && (
            <div style={s.nameClash}>
              <div style={s.nameClashTitle}>{t("modal.nameTaken", { name: form.name })}</div>
              <div style={s.nameClashOptions}>
                <label>
                  <input
                    type="radio"
                    checked={resolution === "replace"}
                    onChange={() => setResolution("replace")}
                  />{" "}
                  {t("modal.saveAsNewVersion")}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={resolution === "rename"}
                    onChange={() => setResolution("rename")}
                  />{" "}
                  {t("modal.rename")}
                </label>
              </div>
            </div>
          )}
          <FormField label={t("modal.nameLabel")} required>
            <TextInput value={form.name} onChange={(v) => set("name", v)} />
          </FormField>
          <FormField label={t("modal.descriptionLabel")}>
            <TextInput value={form.description} onChange={(v) => set("description", v)} />
          </FormField>
          <FormField label={t("modal.typeLabel")}>
            <SelectInput value={form.type} onChange={(v) => set("type", v as SkillType)} options={typeOptions} />
          </FormField>
          <FormField label={t("modal.enabledLabel")}>
            <div style={s.toggleRow}>
              <Toggle on={form.enabled} onChange={(v) => set("enabled", v)} size={16} />
            </div>
          </FormField>
          <FormField label={t("modal.bodyLabel")} required>
            <Textarea value={form.body} onChange={(v) => set("body", v)} rows={12} mono />
            <div style={s.bodyFooter}>{tokens != null && t("modal.tokenCount", { count: tokens })}</div>
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
