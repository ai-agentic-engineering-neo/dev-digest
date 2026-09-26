"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Drawer, Button, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useImportSkillPreview, useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/lib/skill-display";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

interface PreviewForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  ignored_files: string[];
  warnings: string[];
}

/**
 * Import-from-file drawer: choose a .md/.zip -> POST /skills/import/preview
 * (writes nothing) -> an editable preview -> "Save (disabled)" is the ONLY
 * path that POSTs to /skills, and only fires once the user confirms it —
 * nothing is saved just by choosing or previewing a file.
 */
export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<PreviewForm | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const set = <K extends keyof PreviewForm>(key: K, value: PreviewForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onFile = async (file: File) => {
    setFileName(file.name);
    setForm(null);
    const content_base64 = await fileToBase64(file);
    preview.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (data) =>
          setForm({
            name: data.name,
            description: data.description,
            type: data.type,
            body: data.body,
            ignored_files: data.ignored_files,
            warnings: data.warnings,
          }),
      },
    );
  };

  const save = () => {
    if (!form) return;
    create.mutate(
      { name: form.name, description: form.description, type: form.type, body: form.body, source: "imported_file" },
      {
        onSuccess: (skill) => {
          toast.success(t("drawer.importSuccess", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}`);
        },
      },
    );
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    // Drawer is not portaled (client/CLAUDE.md insight): stop clicks here from
    // reaching whatever renders this drawer.
    <div onClick={(e) => e.stopPropagation()}>
      <Drawer
        width={560}
        title={t("drawer.title")}
        subtitle={t("drawer.fileSubtitle")}
        onClose={onClose}
        footer={
          form && (
            <div style={s.footer}>
              <Button kind="ghost" onClick={onClose}>
                {t("config.cancel")}
              </Button>
              <Button kind="primary" icon="Check" onClick={save} disabled={create.isPending || !form.name.trim()}>
                {create.isPending ? t("drawer.saving") : t("drawer.saveDisabled")}
              </Button>
            </div>
          )
        }
      >
        <FormField label={t("drawer.fileLabel")} hint={t("drawer.acceptHint")}>
          <div style={s.fileRow}>
            <Button kind="secondary" size="sm" icon="Upload" onClick={() => fileInputRef.current?.click()}>
              {t("drawer.chooseFile")}
            </Button>
            <span className={fileName ? "mono" : undefined} style={s.fileName}>
              {fileName ?? t("drawer.noFileChosen")}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.zip"
            aria-label={t("drawer.chooseFile")}
            style={s.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </FormField>

        {preview.isPending && <div style={s.status}>{t("drawer.reading")}</div>}
        {preview.isError && <div style={s.error}>{t("drawer.importFailed")}</div>}

        {form && (
          <>
            <div style={s.trustWarning}>{t("drawer.trustWarning")}</div>
            <div style={s.previewHeading}>{t("drawer.previewHeading")}</div>
            <FormField label={t("config.name")} required>
              <TextInput value={form.name} onChange={(v) => set("name", v)} />
            </FormField>
            <FormField label={t("config.description")}>
              <TextInput value={form.description} onChange={(v) => set("description", v)} />
            </FormField>
            <FormField label={t("config.type")}>
              <SelectInput value={form.type} onChange={(v) => set("type", v as SkillType)} options={typeOptions} />
            </FormField>
            <FormField label={t("config.bodyLabel")}>
              <Textarea value={form.body} onChange={(v) => set("body", v)} rows={10} mono />
            </FormField>
            {form.ignored_files.length > 0 && (
              <FormField label={t("drawer.ignoredFilesHeading")}>
                <ul style={s.ignoredList}>
                  {form.ignored_files.map((f) => (
                    <li key={f} className="mono">
                      {f}
                    </li>
                  ))}
                </ul>
              </FormField>
            )}
            {form.warnings.map((w, i) => (
              <div key={i} style={s.warning}>
                {w}
              </div>
            ))}
          </>
        )}
      </Drawer>
    </div>
  );
}
