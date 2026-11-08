/* DocPane — right panel of Project Context: header (name, Preview | Edit, source, tokens, used by),
   a typographic preview, and for `.devdigest` docs an editor with Save, Delete and an unsaved-
   changes guard. Repo docs are read-only with a "Copy to .devdigest/ to edit" action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { DocMarkdown } from "@/components/doc-markdown";
import { DocSourceBadge } from "@/components/doc-source-badge";
import { useContextDoc } from "@/lib/hooks/project-context";
import {
  useCopyDevdigestDoc,
  useDeleteDevdigestDoc,
  useDevdigestDoc,
  useSaveDevdigestDoc,
} from "@/lib/hooks/devdigest-docs";
import { splitDocPath } from "@/lib/context-docs";
import { devdigestErrorOf, MAX_DEVDIGEST_DOC_BYTES, utf8Bytes } from "@/lib/devdigest-docs";
import type { ContextDoc, DevdigestCopyResult } from "@/lib/types";
import { DocEditor } from "./_components/DocEditor";
import { useUnsavedGuard } from "./hooks/useUnsavedGuard";
import { copyErrorText, saveErrorText, type MessageRef } from "./helpers";
import { s } from "./styles";

export type PaneMode = "preview" | "edit";

export interface DocPaneProps {
  repoId: string;
  doc: ContextDoc;
  devdigestId: string | null;
  mode: PaneMode;
  onModeChange: (m: PaneMode) => void;
  /** AC-9: the copy already existed and was opened unchanged. */
  copyExists: boolean;
  onCopied: (r: DevdigestCopyResult) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const MODES: readonly PaneMode[] = ["preview", "edit"];
const SKELETON_LINES = 5;

export function DocPane({
  repoId,
  doc,
  devdigestId,
  mode,
  onModeChange,
  copyExists,
  onCopied,
  onDeleted,
  onDirtyChange,
}: DocPaneProps) {
  const t = useTranslations("context");
  const isDevdigest = devdigestId !== null;
  const repoDoc = useContextDoc(repoId, isDevdigest ? null : doc.path);
  const ddDoc = useDevdigestDoc(devdigestId);
  const query = isDevdigest ? ddDoc : repoDoc;
  const copy = useCopyDevdigestDoc(repoId);
  const save = useSaveDevdigestDoc(repoId);
  const del = useDeleteDevdigestDoc(repoId);

  const [draft, setDraft] = React.useState<string | null>(null);
  const [error, setError] = React.useState<MessageRef | null>(null);

  const content = query.data?.content ?? "";
  const dirty = isDevdigest && draft !== null && draft !== content;
  const shown = draft ?? content;

  useUnsavedGuard(dirty, t("pane.unsavedConfirm", { path: doc.path }));
  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const text = (ref: MessageRef) => t(ref.key, ref.values);

  const onSave = () => {
    if (!devdigestId || draft === null) return;
    if (utf8Bytes(draft) > MAX_DEVDIGEST_DOC_BYTES) {
      setError(saveErrorText({ reason: "too_large" }, ""));
      return;
    }
    setError(null);
    const sent = draft;
    save.mutate(
      { id: devdigestId, content: sent },
      {
        // the editor stays editable while saving: keep anything typed after Save was clicked
        onSuccess: () => setDraft((d) => (d === sent ? null : d)),
        onError: (e) => setError(saveErrorText(devdigestErrorOf(e), e.message)),
      },
    );
  };

  const onCopy = () => {
    setError(null);
    copy.mutate(
      { source_path: doc.path },
      {
        onSuccess: onCopied,
        onError: (e) => setError(copyErrorText(devdigestErrorOf(e), e.message)),
      },
    );
  };

  const onDelete = () => {
    if (!devdigestId) return;
    const usedBy = ddDoc.data?.used_by ?? [];
    const message = t("pane.deleteConfirm", {
      path: doc.path,
      count: usedBy.length,
      agents: usedBy.map((a) => a.name).join(", "),
    });
    if (!window.confirm(message)) return;
    setError(null);
    del.mutate(
      { id: devdigestId },
      {
        onSuccess: () => onDeleted(),
        onError: (e) => setError(saveErrorText(devdigestErrorOf(e), e.message)),
      },
    );
  };

  if (query.isLoading) {
    return (
      <div style={s.skeletons}>
        {Array.from({ length: SKELETON_LINES }, (_, i) => (
          <Skeleton key={i} height={20} />
        ))}
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState body={t("pane.loadError")} onRetry={() => query.refetch()} />;
  }

  const { name } = splitDocPath(doc.path);
  const copiedFrom = ddDoc.data?.copied_from ?? null;

  return (
    <div style={s.pane}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <span style={s.name} title={doc.path}>
            {name}
          </span>
          {isDevdigest && (
            <div role="group" aria-label={t("pane.mode")} style={s.switch}>
              {MODES.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  kind={mode === m ? "secondary" : "ghost"}
                  aria-pressed={mode === m}
                  onClick={() => onModeChange(m)}
                >
                  {t(`pane.${m}`)}
                </Button>
              ))}
            </div>
          )}
          <DocSourceBadge source={doc.source} label={t(`source.${doc.source}`)} />
          <span style={s.meta}>{t("meta.tokens", { count: doc.tokens })}</span>
          <span style={s.spacer} />
          <span style={s.usedBy}>
            <Icon.Cpu size={13} />
            {t("meta.usedBy", { count: doc.attached_agents })}
          </span>
          {!isDevdigest && (
            <Button size="sm" kind="secondary" icon="Copy" loading={copy.isPending} onClick={onCopy}>
              {t("pane.copyToEdit")}
            </Button>
          )}
          {isDevdigest && (
            <Button
              size="sm"
              kind="ghost"
              aria-label={t("pane.deleteLabel", { path: doc.path })}
              title={t("pane.delete")}
              disabled={del.isPending}
              onClick={onDelete}
            >
              <Icon.Trash size={14} />
            </Button>
          )}
        </div>
        {copiedFrom && <p style={s.subMeta}>{t("pane.copiedFrom", { path: copiedFrom })}</p>}
        {copyExists && (
          <p role="status" style={s.notice}>
            {t("pane.copyExists")}
          </p>
        )}
        {error && !(isDevdigest && mode === "edit") && (
          <p role="alert" style={s.error}>
            {text(error)}
          </p>
        )}
      </div>

      {isDevdigest && mode === "edit" ? (
        <DocEditor
          path={doc.path}
          value={shown}
          dirty={dirty}
          saving={save.isPending}
          error={error ? text(error) : null}
          onChange={setDraft}
          onSave={onSave}
        />
      ) : (
        <div style={s.body}>
          <DocMarkdown>{shown}</DocMarkdown>
        </div>
      )}
    </div>
  );
}

export default DocPane;
