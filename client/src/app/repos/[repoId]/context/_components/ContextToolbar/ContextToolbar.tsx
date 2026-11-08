"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useCreateDevdigestDoc } from "@/lib/hooks/devdigest-docs";
import { checkFolderName, devdigestErrorOf } from "@/lib/devdigest-docs";
import type { DevdigestDoc } from "@/lib/types";
import { NameForm } from "./_components/NameForm";
import { UploadReport } from "./_components/UploadReport";
import { useUploadQueue } from "./hooks/useUploadQueue";
import { childFolder, folderLabel, nameRuleText, reasonText, type Translate } from "./helpers";
import { s } from "./styles";

export interface ContextToolbarProps {
  repoId: string;
  targetFolder: string;
  onFileCreated: (doc: DevdigestDoc) => void;
  onFolderCreated: (folder: string) => void;
  resync: { start: () => void; busy: boolean };
}

type FormKind = "file" | "folder" | null;

export function ContextToolbar({ repoId, targetFolder, onFileCreated, onFolderCreated, resync }: ContextToolbarProps) {
  const t = useTranslations("context");
  const tr: Translate = (key, values) => t(key, values);
  const create = useCreateDevdigestDoc(repoId);
  const queue = useUploadQueue(repoId, targetFolder);
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormKind>(null);
  const [error, setError] = useState<string | null>(null);
  const folder = folderLabel(targetFolder);

  const open = (kind: FormKind) => {
    setError(null);
    setForm(kind);
  };

  const submitFile = async (name: string) => {
    try {
      const doc = await create.mutateAsync({ folder: targetFolder, name });
      setForm(null);
      onFileCreated(doc);
    } catch (e) {
      const details = devdigestErrorOf(e);
      setError(details ? reasonText(tr, details) : t("errors.saveFailed", { message: String(e) }));
    }
  };

  const submitFolder = (name: string) => {
    const rule = checkFolderName(name);
    if (rule) {
      setError(nameRuleText(tr, rule));
      return;
    }
    setForm(null);
    onFolderCreated(childFolder(targetFolder, name));
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) queue.start(files);
  };

  const { added, rejected, conflicts } = queue.report;
  const hasReport = added.length + rejected.length + conflicts.length > 0;

  return (
    <div style={s.wrap}>
      <div style={s.bar}>
        <button
          type="button"
          style={s.iconButton}
          aria-label={t("toolbar.newFile")}
          title={t("toolbar.newFileHint", { folder })}
          onClick={() => open("file")}
        >
          <Icon.Plus size={14} />
        </button>
        <button
          type="button"
          style={s.iconButton}
          aria-label={t("toolbar.newFolder")}
          title={t("toolbar.newFolderHint", { folder })}
          onClick={() => open("folder")}
        >
          <Icon.Folder size={14} />
        </button>
        <button
          type="button"
          style={s.iconButton}
          aria-label={t("toolbar.upload")}
          title={t("toolbar.uploadHint", { folder })}
          onClick={() => fileInput.current?.click()}
        >
          <Icon.Upload size={14} />
        </button>
        <button
          type="button"
          style={s.iconButton}
          aria-label={t("toolbar.resync")}
          title={t("toolbar.resyncHint")}
          disabled={resync.busy}
          onClick={resync.start}
        >
          <Icon.RefreshCw size={14} />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".md"
          style={s.hidden}
          tabIndex={-1}
          aria-hidden="true"
          data-testid="upload-input"
          onChange={onPick}
        />
      </div>
      {form === "file" && (
        <NameForm
          label={t("form.fileName")}
          placeholder={t("form.fileName")}
          error={error}
          onSubmit={submitFile}
          onCancel={() => open(null)}
        />
      )}
      {form === "folder" && (
        <NameForm
          label={t("form.folderName")}
          placeholder={t("form.folderName")}
          error={error}
          onSubmit={submitFolder}
          onCancel={() => open(null)}
        />
      )}
      {hasReport && (
        <UploadReport report={queue.report} onResolve={queue.resolveConflict} onDismiss={queue.dismiss} />
      )}
    </div>
  );
}

export default ContextToolbar;
