"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ContextDoc } from "@/lib/types";
import { buildDocTree, type TreeFolder, type TreeSectionKey } from "./helpers";
import { useTreeExpansion } from "./hooks/useTreeExpansion";
import { s } from "./styles";

export interface DocTreeProps {
  repoId: string;
  docs: readonly ContextDoc[];
  extraFolders: readonly string[];
  filter: string;
  selectedPath: string | null;
  selectedFolder: string | null;
  onSelectDoc: (path: string) => void;
  onSelectFolder: (devdigestFolder: string) => void;
}

interface FolderContentsProps {
  section: TreeSectionKey;
  folder: TreeFolder;
  depth: number;
  forceOpen: boolean;
  isOpen: (key: string, isSection: boolean) => boolean;
  toggle: (key: string, isSection: boolean) => void;
  selectedPath: string | null;
  selectedFolder: string | null;
  onSelectDoc: (path: string) => void;
  onSelectFolder: (devdigestFolder: string) => void;
}

function FolderContents(props: FolderContentsProps) {
  const t = useTranslations("context");
  const { section, folder, depth, forceOpen, isOpen, toggle } = props;
  const { selectedPath, selectedFolder, onSelectDoc, onSelectFolder } = props;
  const editable = section === "devdigest";
  return (
    <>
      {folder.folders.map((child) => {
        const open = forceOpen || isOpen(child.key, false);
        const selected = editable && selectedFolder === child.path;
        return (
          <div key={child.key}>
            <button
              type="button"
              aria-expanded={open}
              aria-current={selected ? "true" : undefined}
              style={s.folder(selected, depth)}
              onClick={() => {
                if (!forceOpen) toggle(child.key, false);
                if (editable) onSelectFolder(child.path);
              }}
            >
              <span aria-hidden="true" style={s.caret}>
                {open ? "▾" : "▸"}
              </span>
              <span style={s.name}>{child.name}</span>
            </button>
            {open ? <FolderContents {...props} folder={child} depth={depth + 1} /> : null}
          </div>
        );
      })}
      {folder.docs.map((doc) => {
        const selected = selectedPath === doc.path;
        return (
          <button
            key={doc.path}
            type="button"
            title={doc.path}
            aria-label={t("tree.docLabel", { path: doc.path, count: doc.tokens })}
            aria-current={selected ? "true" : undefined}
            style={s.doc(selected, depth)}
            onClick={() => onSelectDoc(doc.path)}
          >
            <span style={s.name}>{doc.path.slice(doc.path.lastIndexOf("/") + 1)}</span>
            <span style={s.tokens}>{t("meta.tokens", { count: doc.tokens })}</span>
          </button>
        );
      })}
    </>
  );
}

export function DocTree({ repoId, docs, extraFolders, filter, ...handlers }: DocTreeProps) {
  const t = useTranslations("context");
  const { isOpen, toggle } = useTreeExpansion(repoId);
  const sections = useMemo(() => buildDocTree(docs, extraFolders, filter), [docs, extraFolders, filter]);
  const forceOpen = filter.trim() !== "";

  return (
    <nav aria-label={t("tree.label")} style={s.nav}>
      {sections.map(({ key, root }) => {
        const open = forceOpen || isOpen(root.key, true);
        const editable = key === "devdigest";
        const selected = editable && handlers.selectedFolder === "";
        return (
          <div key={key} style={s.section}>
            <button
              type="button"
              aria-expanded={open}
              aria-current={selected ? "true" : undefined}
              style={s.header(selected)}
              onClick={() => {
                if (!forceOpen) toggle(root.key, true);
                if (editable) handlers.onSelectFolder("");
              }}
            >
              <span aria-hidden="true" style={s.caret}>
                {open ? "▾" : "▸"}
              </span>
              {t(`sections.${key}`)}
            </button>
            {open ? (
              <FolderContents
                {...handlers}
                section={key}
                folder={root}
                depth={1}
                forceOpen={forceOpen}
                isOpen={isOpen}
                toggle={toggle}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export default DocTree;
