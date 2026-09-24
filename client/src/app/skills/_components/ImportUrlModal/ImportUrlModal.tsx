/* ImportUrlModal — an https:// URL → POST /skills/import/preview. Errors
   (private address, not markdown, too large…) stay inside the modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useImportPreview } from "@/lib/hooks";
import { s } from "./styles";

export function ImportUrlModal({
  onClose,
  onPreview,
}: {
  onClose: () => void;
  onPreview: (preview: SkillImportPreview) => void;
}) {
  const t = useTranslations("skills");
  const preview = useImportPreview();
  const [url, setUrl] = React.useState("");

  const submit = () => preview.mutate({ kind: "url", url: url.trim() }, { onSuccess: onPreview });

  return (
    <Modal
      width={560}
      title={t("importUrl.title")}
      subtitle={t("importUrl.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("importUrl.cancel")}
          </Button>
          <Button kind="primary" icon="Globe" onClick={submit} disabled={!url.trim() || preview.isPending}>
            {preview.isPending ? t("importUrl.fetching") : t("importUrl.fetch")}
          </Button>
        </div>
      }
    >
      <form
        style={s.body}
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && !preview.isPending) submit();
        }}
      >
        <FormField label={t("importUrl.label")} required>
          <TextInput
            value={url}
            onChange={setUrl}
            type="url"
            placeholder={t("importUrl.placeholder")}
            aria-label={t("importUrl.label")}
            mono
            autoFocus
          />
        </FormField>
        {preview.isError && (
          <div role="alert" style={s.error}>
            {t("importUrl.error", { message: preview.error.message })}
          </div>
        )}
      </form>
    </Modal>
  );
}
