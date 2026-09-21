/* Import from URL tab — the server fetches the file (https only, SSRF-guarded, scanned for
   prompt injection). Server-side failures (blocked host, too large, 404…) surface through the
   global mutation toast; the https check is the only inline validation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useImportSkillUrl } from "@/lib/hooks/skills";
import { DEFAULT_SKILL_TYPE } from "../../constants";
import type { AddSkillTabProps } from "../../types";
import { SkillTypeField } from "../SkillTypeField";
import { buildUrlPayload, isHttpsUrl } from "./helpers";
import { s } from "./styles";

export function FromUrlTab({ onAdded }: AddSkillTabProps) {
  const t = useTranslations("skillsImport");
  const importUrl = useImportSkillUrl();
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);

  const hasUrl = url.trim() !== "";
  const valid = isHttpsUrl(url);
  const ready = valid && !importUrl.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    try {
      onAdded(await importUrl.mutateAsync(buildUrlPayload(url, name, type)), "imported");
    } catch {
      // Surfaced by the global mutation error toast; keep the modal open to retry.
    }
  };

  return (
    <form onSubmit={submit} aria-label={t("tabs.url")} noValidate>
      <FormField label={t("url.label")} hint={t("url.hint")}>
        <TextInput
          type="url"
          value={url}
          onChange={setUrl}
          placeholder={t("url.placeholder")}
          mono
          aria-label={t("url.label")}
          aria-invalid={hasUrl && !valid}
        />
        {hasUrl && !valid && (
          <div role="alert" style={s.error}>
            {t("url.invalid")}
          </div>
        )}
      </FormField>
      <FormField label={t("url.nameLabel")} hint={t("url.nameHint")}>
        <TextInput
          value={name}
          onChange={setName}
          placeholder={t("url.namePlaceholder")}
          mono
          aria-label={t("url.nameLabel")}
        />
      </FormField>
      <SkillTypeField value={type} onChange={setType} />
      <Button type="submit" kind="primary" full disabled={!ready} loading={importUrl.isPending}>
        {importUrl.isPending ? t("url.fetching") : t("url.submit")}
      </Button>
    </form>
  );
}
