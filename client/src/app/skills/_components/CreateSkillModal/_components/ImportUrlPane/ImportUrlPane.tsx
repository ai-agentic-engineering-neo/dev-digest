/* ImportUrlPane — "Import from URL" tab of the Add skill dialog: the server
   fetches the file (https, public hosts, ≤ 64 KB) and returns a scanned draft;
   nothing is saved here. A refused URL shows the server's reason inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import type { SkillFormValues } from "@/app/skills/_components/helpers";
import { useImportSkillUrl } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { toSkillSlug } from "../../helpers";
import { s } from "./styles";

export interface ImportUrlPaneProps {
  onLoaded: (form: SkillFormValues, sourceUrl: string) => void;
}

export function ImportUrlPane({ onLoaded }: ImportUrlPaneProps) {
  const t = useTranslations("skills");
  const fetchDraft = useImportSkillUrl();
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");

  const canFetch = url.trim().startsWith("https://") && !fetchDraft.isPending;
  const error =
    fetchDraft.error instanceof ApiError ? fetchDraft.error.message : fetchDraft.error ? t("add.url.failed") : null;

  const submit = () => {
    if (!canFetch) return;
    fetchDraft.mutate(url.trim(), {
      onSuccess: (draft) =>
        onLoaded(
          {
            // A name typed here wins over the one taken from the file's heading.
            name: toSkillSlug(name) || draft.name,
            description: draft.description,
            type: draft.type,
            body: draft.body,
          },
          draft.source_url,
        ),
    });
  };

  return (
    <div style={s.form}>
      <FormField label={t("add.url.label")} required hint={t("add.url.hint")}>
        <TextInput
          value={url}
          onChange={setUrl}
          placeholder={t("url.placeholder")}
          aria-label={t("add.url.label")}
          aria-invalid={!!error}
          mono
        />
      </FormField>
      <FormField label={t("add.url.nameLabel")} hint={t("add.url.nameHint")}>
        <TextInput
          value={name}
          onChange={setName}
          placeholder={t("add.url.namePlaceholder")}
          aria-label={t("add.url.nameLabel")}
          mono
        />
      </FormField>
      {error && (
        <p role="alert" style={s.error}>
          {error}
        </p>
      )}
      <Button kind="primary" icon="Link" onClick={submit} disabled={!canFetch}>
        {fetchDraft.isPending ? t("add.url.fetching") : t("add.url.fetch")}
      </Button>
    </div>
  );
}
