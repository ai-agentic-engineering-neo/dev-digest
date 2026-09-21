/* ImportSkillDrawer — bring a skill in from a file, an archive, or a URL.
   Always two steps: PREVIEW what was parsed, then confirm. Nothing is saved
   until the user has seen whose instructions they are about to install. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, FormField, Icon, Tabs, TextInput } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import {
  useCreateSkill,
  useImportPreview,
  useImportPreviewFromUrl,
} from "../../../../lib/hooks/skills";
import { extractSkillFromArchive, isArchive } from "./helpers";
import {
  ACCEPTED_FILE_TYPES,
  DRAWER_WIDTH,
  MAX_ARCHIVE_BYTES,
  MAX_IMPORT_BYTES,
  MAX_SKIPPED_SHOWN,
} from "./constants";
import { s } from "./styles";

type Tab = "file" | "url";

export function ImportSkillDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<Tab>("file");
  const [url, setUrl] = React.useState("");
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const previewFile = useImportPreview();
  const previewUrl = useImportPreviewFromUrl();
  const create = useCreateSkill();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const busy = previewFile.isPending || previewUrl.isPending || create.isPending;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreview(null);
    try {
      const archive = isArchive(file);
      if (file.size > (archive ? MAX_ARCHIVE_BYTES : MAX_IMPORT_BYTES)) {
        throw new Error(t("file.tooLarge", { name: file.name }));
      }

      // An archive is unpacked HERE, in the browser, and only the one markdown
      // member ever leaves this function. The server never receives the other
      // bytes, so there is nothing executable for it to mishandle.
      const doc = archive
        ? extractSkillFromArchive(new Uint8Array(await file.arrayBuffer()))
        : { text: await file.text(), entry: file.name, skipped: [] as string[] };

      setPreview(
        await previewFile.mutateAsync({
          text: doc.text,
          origin: archive ? `${file.name} › ${doc.entry}` : file.name,
          source: "imported_file",
          skipped_entries: doc.skipped,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUrl = async () => {
    setError(null);
    setPreview(null);
    try {
      setPreview(await previewUrl.mutateAsync(url.trim()));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setError(null);
    try {
      const skill = await create.mutateAsync({
        name: preview.name,
        description: preview.description,
        type: preview.type,
        body: preview.body,
        source: preview.source,
        // Imported skills arrive OFF. Enabling them is a separate, deliberate
        // act — that is the entire difference between importing and trusting.
        enabled: false,
      });
      onImported(skill);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {error && <span style={s.error}>{error}</span>}
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={confirm} disabled={!preview || busy}>
            {create.isPending ? t("drawer.saving") : t("drawer.saveSkill")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <Tabs
          tabs={[
            { key: "file", label: t("drawer.tabs.file"), icon: "Upload" },
            { key: "url", label: t("drawer.tabs.url"), icon: "Link" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />

        {tab === "file" ? (
          <div style={s.section}>
            <FormField label={t("drawer.fileLabel")} hint={t("drawer.fileHint")}>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={(e) => void onFile(e.target.files?.[0])}
                style={s.fileInput}
              />
            </FormField>
          </div>
        ) : (
          <div style={s.section}>
            <FormField label={t("url.label")} hint={t("url.hint")}>
              <TextInput value={url} onChange={setUrl} placeholder={t("url.placeholder")} mono />
            </FormField>
            <Button
              kind="secondary"
              size="sm"
              icon="Search"
              onClick={onUrl}
              disabled={!url.trim() || busy}
            >
              {previewUrl.isPending ? t("url.fetching") : t("url.import")}
            </Button>
          </div>
        )}

        {preview && <PreviewCard preview={preview} />}
      </div>
    </Drawer>
  );
}

/** The "here is what we parsed, and what we refused to read" step. */
function PreviewCard({ preview }: { preview: SkillImportPreview }) {
  const t = useTranslations("skills");
  const shown = preview.skipped_entries.slice(0, MAX_SKIPPED_SHOWN);
  const extra = preview.skipped_entries.length - shown.length;

  return (
    <div style={s.preview}>
      <div style={s.previewHead}>
        <Icon.FileText size={14} style={{ color: "var(--accent)" }} />
        <span className="mono" style={s.previewName}>
          {preview.name}
        </span>
        <Badge color="var(--text-muted)">{t(`listItem.type.${preview.type}`)}</Badge>
      </div>

      {preview.origin && <div style={s.origin}>{preview.origin}</div>}
      {preview.description && <p style={s.previewDesc}>{preview.description}</p>}

      <div style={s.untrustedNotice}>
        <Icon.AlertTriangle size={14} style={{ flexShrink: 0, color: "var(--warn)" }} />
        <span>{t("drawer.trustNotice")}</span>
      </div>

      {preview.skipped_entries.length > 0 && (
        <div style={s.skipped}>
          <div style={s.skippedHead}>
            <Icon.Shield size={13} style={{ color: "var(--ok)" }} />
            <span>{t("drawer.skippedTitle", { count: preview.skipped_entries.length })}</span>
          </div>
          <ul style={s.skippedList}>
            {shown.map((entry) => (
              <li key={entry} className="mono" style={s.skippedItem}>
                {entry}
              </li>
            ))}
            {extra > 0 && <li style={s.skippedItem}>{t("drawer.skippedMore", { count: extra })}</li>}
          </ul>
        </div>
      )}

      <div style={s.bodyLabel}>{t("preview.bodyLabel")}</div>
      <pre className="mono" style={s.bodyPre}>
        {preview.body}
      </pre>
    </div>
  );
}
