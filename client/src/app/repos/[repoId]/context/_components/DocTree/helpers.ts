import type { ContextDoc } from "@/lib/types";
import { filterDocs } from "@/lib/context-docs";
import { devdigestRelative } from "@/lib/devdigest-docs";
import { SECTION_ORDER } from "./constants";

export type TreeSectionKey = "devdigest" | "specs" | "docs" | "insights" | "readme";

export interface TreeFolder {
  key: string;
  name: string;
  path: string;
  folders: TreeFolder[];
  docs: ContextDoc[];
}
export interface TreeSection {
  key: TreeSectionKey;
  root: TreeFolder;
}

function newFolder(section: TreeSectionKey, name: string, path: string): TreeFolder {
  return { key: `${section}:${path}`, name, path, folders: [], docs: [] };
}

function ensureFolder(section: TreeSectionKey, root: TreeFolder, segments: readonly string[]): TreeFolder {
  let node = root;
  segments.forEach((seg, i) => {
    let next = node.folders.find((f) => f.name === seg);
    if (!next) {
      next = newFolder(section, seg, segments.slice(0, i + 1).join("/"));
      node.folders.push(next);
    }
    node = next;
  });
  return node;
}

function byteCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function sortFolder(folder: TreeFolder): void {
  folder.folders.sort((a, b) => byteCompare(a.name, b.name));
  folder.docs.sort((a, b) => byteCompare(fileName(a.path), fileName(b.path)));
  folder.folders.forEach(sortFolder);
}

export interface FlatSection {
  key: TreeSectionKey;
  /** Every doc of the section, sorted by full path (byte order). */
  docs: ContextDoc[];
  /** devdigest-relative folder paths (incl. empty New-folder ones), sorted; only for the devdigest section. */
  folders: string[];
}

/** One section as a flat list of rows: the panel shows each doc with its folder line, not nested folders. */
export function flattenSection(section: TreeSection): FlatSection {
  const docs: ContextDoc[] = [];
  const folders: string[] = [];
  const walk = (folder: TreeFolder) => {
    docs.push(...folder.docs);
    for (const child of folder.folders) {
      folders.push(child.path);
      walk(child);
    }
  };
  walk(section.root);
  docs.sort((a, b) => byteCompare(a.path, b.path));
  folders.sort(byteCompare);
  return { key: section.key, docs, folders: section.key === "devdigest" ? folders : [] };
}

/** Folder part of a path with a trailing "/" ("" for a root file). */
export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
}

/** What the area chip shows: a folder name as-is, or the (translated) "root" label for a root file. */
export type DocArea = { kind: "folder"; name: string } | { kind: "root" };

/** Area chip: the top-level folder (package) of a repo doc, root for a root file; devdigest docs use their relative path (no chip at the top level). */
export function docArea(doc: ContextDoc): DocArea | null {
  const rel = doc.source === "devdigest" ? devdigestRelative(doc.path) : doc.path;
  const [first, ...rest] = rel.split("/");
  if (rest.length > 0 && first) return { kind: "folder", name: first };
  return doc.source === "devdigest" ? null : { kind: "root" };
}

export { fileName };

/** Group docs into sections (SECTION_ORDER) of nested folders; the filter is the SPEC-01 AC-3 rule. */
export function buildDocTree(
  docs: readonly ContextDoc[],
  extraFolders: readonly string[],
  filter: string,
): TreeSection[] {
  const roots = new Map<TreeSectionKey, TreeFolder>();
  const rootOf = (key: TreeSectionKey): TreeFolder => {
    let root = roots.get(key);
    if (!root) {
      root = newFolder(key, key, "");
      roots.set(key, root);
    }
    return root;
  };

  for (const doc of filterDocs(docs, filter)) {
    const rel = doc.source === "devdigest" ? devdigestRelative(doc.path) : doc.path;
    const segments = rel.split("/").slice(0, -1);
    ensureFolder(doc.source, rootOf(doc.source), segments).docs.push(doc);
  }

  if (filter.trim() === "") {
    for (const folder of extraFolders) {
      const segments = folder.split("/").filter((seg) => seg !== "");
      if (segments.length > 0) ensureFolder("devdigest", rootOf("devdigest"), segments);
    }
  }

  const sections: TreeSection[] = [];
  for (const key of SECTION_ORDER) {
    const root = roots.get(key);
    if (!root) continue;
    sortFolder(root);
    sections.push({ key, root });
  }
  return sections;
}
