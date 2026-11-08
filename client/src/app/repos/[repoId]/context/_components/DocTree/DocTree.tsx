"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextDoc } from "@/lib/types";
import { DEVDIGEST_ROOT } from "@/lib/devdigest-docs";
import { buildDocTree, docArea, fileName, flattenSection, folderOf } from "./helpers";
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

function DocRow({ doc, selected, onSelect }: { doc: ContextDoc; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("context");
  const area = docArea(doc);
  const folder = folderOf(doc.path);
  return (
    <button
      type="button"
      title={doc.path}
      aria-label={t("tree.docLabel", { path: doc.path, count: doc.tokens })}
      aria-current={selected ? "true" : undefined}
      style={s.doc(selected)}
      onClick={onSelect}
    >
      <span aria-hidden="true" style={s.icon(selected)}>
        <Icon.FileText size={15} />
      </span>
      <span style={s.body}>
        <span style={s.line}>
          <span style={s.name}>{fileName(doc.path)}</span>
          {area ? <span style={s.chip}>{area.kind === "root" ? t("tree.rootArea") : area.name}</span> : null}
        </span>
        <span style={s.line}>
          <span style={s.path}>{folder}</span>
          <span style={s.tokens}>{t("meta.tokens", { count: doc.tokens })}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * Grouped doc list (SPEC-03 AC-2): collapsible sections in SECTION_ORDER, each a flat list of doc rows
 * (icon, file name, area chip, folder line, token estimate). The devdigest section also lists its folders,
 * which are selectable as the New file / Upload target.
 */
export function DocTree({ repoId, docs, extraFolders, filter, ...handlers }: DocTreeProps) {
  const t = useTranslations("context");
  const { isOpen, toggle } = useTreeExpansion(repoId);
  const sections = useMemo(
    () => buildDocTree(docs, extraFolders, filter).map(flattenSection),
    [docs, extraFolders, filter],
  );
  const forceOpen = filter.trim() !== "";

  return (
    <nav aria-label={t("tree.label")} style={s.nav}>
      {sections.map(({ key, docs: rows, folders }) => {
        const sectionKey = `${key}:`;
        const open = forceOpen || isOpen(sectionKey, true);
        const editable = key === "devdigest";
        const rootSelected = editable && handlers.selectedFolder === "";
        return (
          <div key={key} style={s.section}>
            <button
              type="button"
              aria-expanded={open}
              aria-current={rootSelected ? "true" : undefined}
              style={s.header(rootSelected)}
              onClick={() => {
                if (!forceOpen) toggle(sectionKey, true);
                if (editable) handlers.onSelectFolder("");
              }}
            >
              <span aria-hidden="true" style={s.caret}>
                {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
              </span>
              <span style={s.headerLabel}>{t(`sections.${key}`)}</span>
              <span aria-hidden="true" style={s.count}>
                {rows.length}
              </span>
            </button>
            {open ? (
              <>
                {folders.map((folder) => {
                  const selected = handlers.selectedFolder === folder;
                  return (
                    <button
                      key={folder}
                      type="button"
                      aria-label={folder}
                      title={`${DEVDIGEST_ROOT}${folder}/`}
                      aria-current={selected ? "true" : undefined}
                      style={s.folder(selected)}
                      onClick={() => handlers.onSelectFolder(folder)}
                    >
                      <span aria-hidden="true" style={s.caret}>
                        <Icon.Folder size={15} />
                      </span>
                      <span style={s.folderPath}>{folder}/</span>
                    </button>
                  );
                })}
                {rows.map((doc) => (
                  <DocRow
                    key={doc.path}
                    doc={doc}
                    selected={handlers.selectedPath === doc.path}
                    onSelect={() => handlers.onSelectDoc(doc.path)}
                  />
                ))}
              </>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export default DocTree;
