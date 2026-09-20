/* ImportSkillDrawer — bring someone else's skill in from a .md file or a .zip.
   Two stages: pick a file, then review what was read and confirm. NOTHING is
   saved until the confirm, and an archive's non-Markdown entries are listed by
   name only — never opened, never run. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Drawer,
  FormField,
  Icon,
  Markdown,
  SelectInput,
  TextInput,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/api/skills";
import { useToast } from "@/lib/toast";
import { skillTypeOptions } from "../../helpers";
import {
  baseName,
  guessType,
  ignoredEntries,
  parseSkillMarkdown,
  pickSkillEntry,
  readZipEntries,
  readZipText,
} from "./helpers";
import { s } from "./styles";

interface Draft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Path inside the archive the body came from; empty for a plain .md. */
  from: string;
  ignored: string[];
}

export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [over, setOver] = React.useState(false);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const read = async (file: File) => {
    setError(null);
    try {
      if (/\.zip$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const entries = readZipEntries(buf);
        const picked = pickSkillEntry(entries);
        if (!picked) {
          setError(t("file.noMarkdown"));
          return;
        }
        const text = await readZipText(buf, picked);
        const parsed = parseSkillMarkdown(text, baseName(picked.name.split("/").pop() ?? file.name));
        setDraft({ ...parsed, type: guessType(text), from: picked.name, ignored: ignoredEntries(entries, picked) });
        return;
      }
      const text = await file.text();
      const parsed = parseSkillMarkdown(text, baseName(file.name));
      setDraft({ ...parsed, type: guessType(text), from: "", ignored: [] });
    } catch {
      setError(t("file.readFailed"));
    }
  };

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void read(file);
  };

  const save = () => {
    if (!draft) return;
    create.mutate(
      {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        source: "imported_file",
        // Someone else's instructions: they land off, and a human turns them on.
        enabled: false,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}`);
        },
      },
    );
  };

  const footer = draft ? (
    <div style={s.footer}>
      <Button kind="ghost" size="sm" onClick={() => setDraft(null)}>
        {t("file.back")}
      </Button>
      <span style={s.footerSpacer} />
      <Button
        kind="primary"
        size="sm"
        icon="Check"
        disabled={create.isPending || !draft.name.trim() || !draft.description.trim()}
        onClick={save}
      >
        {create.isPending ? t("file.importing") : t("file.import")}
      </Button>
    </div>
  ) : undefined;

  return (
    <Drawer width={520} title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose} footer={footer}>
      {!draft && (
        <>
          <div
            style={s.drop(over)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              onFiles(e.dataTransfer.files);
            }}
          >
            <Icon.Upload size={22} style={{ color: "var(--text-muted)" }} />
            <span style={s.dropTitle}>{t("file.dropTitle")}</span>
            <span style={s.dropBody}>{t("file.dropBody")}</span>
            <Button kind="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              {t("file.choose")}
            </Button>
            <span style={s.dropBody}>{t("file.accept")}</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".md,.markdown,.zip"
            style={s.hiddenInput}
            onChange={(e) => onFiles(e.target.files)}
          />
          {error && <div style={s.error}>{error}</div>}
        </>
      )}

      {draft && (
        <>
          <div style={s.notice}>
            <Icon.AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0 }} />
            <span>{t("file.disabledNotice")}</span>
          </div>

          {draft.from && (
            <div style={{ ...s.sourceRow, marginTop: 12 }}>
              <Icon.FileText size={13} />
              {t("file.pickedFrom", { path: draft.from })}
            </div>
          )}

          <div style={{ ...s.fields, marginTop: 14 }}>
            <FormField label={t("file.nameLabel")} required>
              <TextInput value={draft.name} onChange={(v) => patch("name", v)} mono />
            </FormField>
            <FormField label={t("file.descriptionLabel")} hint={t("file.descriptionHint")} required>
              <TextInput value={draft.description} onChange={(v) => patch("description", v)} />
            </FormField>
            <FormField label={t("file.typeLabel")}>
              <SelectInput
                value={draft.type}
                options={skillTypeOptions(t)}
                onChange={(v) => patch("type", v as SkillType)}
              />
            </FormField>
          </div>

          <div style={s.sectionLabel}>{t("file.previewLabel")}</div>
          <div style={s.preview}>
            <Markdown>{draft.body}</Markdown>
          </div>

          {draft.ignored.length > 0 && (
            <>
              <div style={s.sectionLabel}>{t("file.ignoredTitle", { count: draft.ignored.length })}</div>
              <div style={s.ignoredList}>
                {draft.ignored.map((name) => (
                  <span key={name} className="mono" style={s.ignoredItem}>
                    {name}
                  </span>
                ))}
              </div>
              <div style={s.ignoredBody}>{t("file.ignoredBody")}</div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
