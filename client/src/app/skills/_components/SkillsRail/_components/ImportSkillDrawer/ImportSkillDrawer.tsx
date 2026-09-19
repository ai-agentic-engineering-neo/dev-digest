"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { SKILL_TYPE_VALUES } from "../../../../constants";
import { isValidSkillName } from "../../../../helpers";
import { ACCEPT, DRAWER_WIDTH, MAX_UPLOAD_BYTES } from "./constants";
import { arrayBufferToBase64 } from "./helpers";
import { s } from "./styles";

/**
 * Import drawer (D6) — the client half of "parse in memory, return a preview,
 * persist nothing" (§7.4). `POST /skills/import` only ever parses; the skill
 * is created only after the user explicitly confirms the preview, and it is
 * created with `enabled: false` — nothing is enabled by the act of importing
 * it (§10).
 */
export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();

  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    name: string;
    description: string;
    type: SkillType;
    body: string;
    source: string;
    ignored_entries: string[];
    warnings: string[];
  } | null>(null);

  const nameValid = result ? isValidSkillName(result.name) : false;
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("import.tooLarge"));
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const content_b64 = arrayBufferToBase64(buffer);
      const parsed = await preview.mutateAsync({ filename: file.name, content_b64 });
      setResult({ ...parsed });
    } catch {
      setError(t("drawer.importFailed"));
    }
  };

  const confirmImport = async () => {
    if (!result || !nameValid) return;
    try {
      const skill = await create.mutateAsync({
        name: result.name,
        description: result.description,
        type: result.type,
        body: result.body,
        source: "imported_file",
        enabled: false,
      });
      toast.success(t("file.success", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      toast.error(t("drawer.importFailed"));
    }
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("newSkill.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Upload"
            onClick={confirmImport}
            disabled={!result || !nameValid || create.isPending}
          >
            {create.isPending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      }
    >
      {!result && (
        <div style={s.section}>
          <div style={s.dropzone}>
            <input type="file" accept={ACCEPT} onChange={onFileChange} aria-label={t("import.filePickerLabel")} />
          </div>
          <div style={s.hint}>{t("file.bodyHint")}</div>
          {preview.isPending && <div style={s.hint}>{t("file.importing")}</div>}
          {error && <div style={s.error}>{error}</div>}
        </div>
      )}

      {result && (
        <>
          <div style={s.badgeRow}>
            <Badge icon="Upload">{t(`listItem.source.${result.source}`)}</Badge>
            <span title={t("listItem.vettingTitle")}>
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                {t("preview.untrustedBadge")}
              </Badge>
            </span>
          </div>

          <FormField label={t("file.nameLabel")} required>
            <TextInput value={result.name} onChange={(v) => setResult({ ...result, name: v })} mono />
            {!nameValid && <div style={s.error}>{t("newSkill.slugError")}</div>}
          </FormField>
          <FormField label={t("newSkill.fields.description")} hint={t("config.descriptionHint")}>
            <TextInput value={result.description} onChange={(v) => setResult({ ...result, description: v })} />
          </FormField>
          <FormField label={t("newSkill.fields.type")}>
            <SelectInput
              value={result.type}
              onChange={(v) => setResult({ ...result, type: v as SkillType })}
              options={typeOptions}
              mono={false}
            />
          </FormField>
          <FormField label={t("file.bodyLabel")}>
            <pre style={s.bodyPreview}>{result.body}</pre>
          </FormField>

          {result.ignored_entries.length > 0 && (
            <FormField label={t("import.ignored", { count: result.ignored_entries.length })}>
              <ul style={s.list}>
                {result.ignored_entries.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </FormField>
          )}

          {result.warnings.length > 0 && (
            <FormField label={t("import.executableWarning")}>
              <ul style={s.list}>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </FormField>
          )}
        </>
      )}
    </Drawer>
  );
}
