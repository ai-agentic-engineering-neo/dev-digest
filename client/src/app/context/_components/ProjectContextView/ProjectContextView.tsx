/* /context — Project Context. A file panel on the left lists the Markdown
   documents of the sidebar's active repository; the pane on the right shows
   the opened one (Preview) or edits it (Edit), saving a local override of its
   text (the repository itself is never written). The repository comes from
   the shell's selector (useActiveRepo); switching it there reloads this page.
   Attaching happens in the agent and skill editors. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useActiveRepo, useRepoChangeGuard, type RepoChangeGuard } from "@/lib/repo-context";
import { useAgents } from "@/lib/hooks/agents";
import {
  useContextFile,
  useContextFiles,
  useRefreshContext,
  useResetContextFile,
  useSaveContextFile,
} from "@/lib/hooks/project-context";
import { DISCOVERY_ROOTS, canSaveDraft } from "@/lib/project-context";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { DocPane } from "./_components/DocPane";
import { FilePanel } from "./_components/FilePanel";
import { useSaveShortcut } from "./hooks/useSaveShortcut";
import { DOC_PARAM, type DocMode } from "./constants";
import { commonFolder, coveragePercent, pageHref } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const router = useRouter();
  const search = useSearchParams();
  const { repoId, activeRepo: repo, reposLoaded } = useActiveRepo();
  const doc = search.get(DOC_PARAM);
  const toast = useToast();
  // Preview (rendered Markdown) or Edit (the textarea); back to Preview, with
  // no draft, whenever another document is opened.
  const [mode, setMode] = React.useState<DocMode>("preview");
  // The text being edited; null = untouched (the effective text is shown).
  const [draft, setDraft] = React.useState<string | null>(null);
  // An action held back by unsaved changes until the user picks Discard.
  const [held, setHeld] = React.useState<(() => void) | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  React.useEffect(() => {
    setMode("preview");
    setDraft(null);
  }, [doc]);

  const listable = !!repo?.clone_path;
  const files = useContextFiles(listable ? repoId : null);
  const list = files.data ?? [];
  const folder = commonFolder(list.map((f) => f.path));
  const opened = doc ? list.find((f) => f.path === doc) : undefined;
  // a too-large document has no readable text (the API answers 422): do not ask for it
  const tooLarge = !!opened?.too_large;
  const preview = useContextFile(listable ? repoId : null, tooLarge ? null : doc);
  const saveFile = useSaveContextFile();
  const resetFile = useResetContextFile();
  const refresh = useRefreshContext();
  const agents = useAgents();
  const enabledAgents = (agents.data ?? []).filter((a) => a.enabled).length;

  const crumb = [{ label: t("page.crumbSection") }, { label: t("page.crumbContext") }];
  const notCloned = !!repo && !repo.clone_path;
  // a 409 from the API means the clone is gone even though the repo row says otherwise
  const apiNotCloned = files.error instanceof ApiError && files.error.status === 409;
  const usedBy = opened?.agents_using ?? 0;

  const effective = preview.data?.text ?? "";
  const text = draft ?? effective;
  const dirty = mode === "edit" && draft !== null && draft !== effective;

  // Run `action` now, or after the user confirms discarding the unsaved text.
  const guarded = (action: () => void) => (dirty ? setHeld(() => action) : action());
  const repoGuard = React.useCallback<RepoChangeGuard>((proceed) => setHeld(() => proceed), []);
  useRepoChangeGuard(dirty ? repoGuard : null);

  const select = (path: string) => {
    if (path !== doc) guarded(() => router.replace(pageHref(search, { [DOC_PARAM]: path })));
  };
  const setViewMode = (next: DocMode) => {
    if (next === mode) return;
    if (next === "preview") {
      guarded(() => {
        setMode("preview");
        setDraft(null);
      });
    } else setMode(next);
  };
  const discard = () => {
    const action = held;
    setHeld(null);
    setDraft(null);
    action?.();
  };

  const save = () => {
    if (!repoId || !doc || saveFile.isPending || !canSaveDraft(text, effective)) return;
    saveFile.mutate(
      { repoId, path: doc, text },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(t("page.edit.savedToast"));
        },
      },
    );
  };
  useSaveShortcut(mode === "edit" && !tooLarge && !!preview.data, save);

  const reset = () => {
    if (!repoId || !doc) return;
    resetFile.mutate(
      { repoId, path: doc, text: "" },
      {
        onSuccess: () => {
          setResetOpen(false);
          setDraft(null);
          toast.success(t("page.reset.resetToast"));
        },
      },
    );
  };

  // Repository-level states take the whole main area; the file panel stays.
  let main: React.ReactNode;
  if (!reposLoaded || (listable && files.isLoading)) {
    main = null;
  } else if (!repo) {
    main = <EmptyState icon="Folder" title={t("page.noRepo.title")} body={t("page.noRepo.body")} />;
  } else if (notCloned || apiNotCloned) {
    main = <ErrorState title={t("page.notCloned.title")} body={t("page.notCloned.body")} onRetry={() => void files.refetch()} />;
  } else if (files.isError) {
    main = <ErrorState body={t("page.loadError")} onRetry={() => void files.refetch()} />;
  } else if (list.length === 0) {
    main = <EmptyState icon="FileText" title={t("page.empty.title")} body={t("page.empty.body", { roots: DISCOVERY_ROOTS.join(", ") })} />;
  }

  return (
    <AppShell crumb={crumb}>
      {held && (
        <ConfirmDialog
          title={t("page.unsaved.title")}
          body={t("page.unsaved.body", { path: doc ?? "" })}
          confirmLabel={t("page.unsaved.discard")}
          cancelLabel={t("page.unsaved.cancel")}
          onConfirm={discard}
          onCancel={() => setHeld(null)}
        />
      )}
      {resetOpen && (
        <ConfirmDialog
          title={t("page.reset.title")}
          body={t("page.reset.body", { path: doc ?? "" })}
          confirmLabel={t("page.reset.confirm")}
          cancelLabel={t("page.reset.cancel")}
          pending={resetFile.isPending}
          onConfirm={reset}
          onCancel={() => setResetOpen(false)}
        />
      )}
      <div style={s.page}>
        <FilePanel
          folder={folder}
          files={list}
          loading={!reposLoaded || (listable && files.isLoading)}
          selected={doc}
          listable={listable && !apiNotCloned && !files.isError}
          refreshing={refresh.isPending}
          onRefresh={() => !refresh.isPending && repoId && refresh.mutate(repoId)}
          onSelect={select}
        />
        {main ? (
          <section style={s.state}>{main}</section>
        ) : (
          <DocPane
            doc={doc}
            folder={folder}
            tokens={opened?.tokens}
            tooLarge={tooLarge}
            modified={!!preview.data?.modified}
            updatedAt={preview.data?.updated_at}
            loading={preview.isLoading}
            error={preview.isError}
            onRetry={() => void preview.refetch()}
            mode={mode}
            onMode={setViewMode}
            effective={effective}
            text={text}
            saving={saveFile.isPending}
            onDraftChange={setDraft}
            onSave={save}
            onResetRequest={() => setResetOpen(true)}
            usedBy={usedBy}
            enabledAgents={enabledAgents}
            coverage={coveragePercent(usedBy, enabledAgents)}
          />
        )}
      </div>
    </AppShell>
  );
}
