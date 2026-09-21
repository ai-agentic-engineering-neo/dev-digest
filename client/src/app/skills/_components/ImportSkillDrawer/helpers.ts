import { strFromU8, unzipSync } from "fflate";
import { MAX_IMPORT_BYTES, SKILL_DOC_BASENAMES } from "./constants";

/**
 * Archive handling for skill import.
 *
 * The product imports CONFIGURATION TEXT. A skill archive from the wild also
 * contains `scripts/`, hooks, binaries — things designed to run. None of that is
 * read, decompressed, written to disk, or sent to the server: we pick exactly
 * ONE markdown document out of the archive and list everything else as skipped
 * so the user can see what we ignored. That list is the honest version of
 * "executable parts are not processed".
 */

export interface ExtractedDocument {
  /** The markdown text of the single entry we chose to read. */
  text: string;
  /** Which archive member it came from, shown in the preview header. */
  entry: string;
  /** Every other member — enumerated, never decompressed. */
  skipped: string[];
}

/**
 * Choose the skill document from a list of archive member names.
 *
 * Preference order: a file literally named `SKILL.md` (the convention), then
 * the shallowest markdown file, tie-broken alphabetically so the same archive
 * always yields the same result. Returns undefined when there is no markdown at
 * all — an archive of scripts is not a skill.
 *
 * Pure, so the choice is unit-testable without building a zip.
 */
export function pickSkillEntry(names: string[]): string | undefined {
  const markdown = names.filter((n) => !n.endsWith("/") && /\.mdx?$/i.test(n));
  if (markdown.length === 0) return undefined;

  return [...markdown].sort(
    (a, b) => rank(a) - rank(b) || depth(a) - depth(b) || a.localeCompare(b),
  )[0];
}

/**
 * Position in SKILL_DOC_BASENAMES, which is a PREFERENCE ORDER, not a set:
 * `SKILL.md` beats `README.md` even when the README sits closer to the root.
 * Anything not in the list ranks after all of them.
 */
function rank(path: string): number {
  const i = SKILL_DOC_BASENAMES.indexOf(basename(path).toLowerCase());
  return i === -1 ? SKILL_DOC_BASENAMES.length : i;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function depth(path: string): number {
  return path.split("/").length;
}

/**
 * Pull the single skill document out of a zip archive, in the browser.
 *
 * `unzipSync`'s `filter` runs for every member but only members it accepts are
 * decompressed — so recording the rejected names inside it is how we can list
 * what was skipped without ever inflating those bytes.
 */
export function extractSkillFromArchive(bytes: Uint8Array): ExtractedDocument {
  const names: string[] = [];
  // First pass: enumerate only. Every member is rejected, so nothing inflates.
  unzipSync(bytes, {
    filter: (file) => {
      names.push(file.name);
      return false;
    },
  });

  const entry = pickSkillEntry(names);
  if (!entry) {
    throw new Error("That archive contains no markdown document to import.");
  }

  // Second pass: inflate exactly one member.
  const unzipped = unzipSync(bytes, { filter: (file) => file.name === entry });
  const data = unzipped[entry];
  if (!data) throw new Error(`Could not read "${entry}" from the archive.`);
  if (data.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`"${entry}" is too large to import.`);
  }

  return {
    text: strFromU8(data),
    entry,
    skipped: names.filter((n) => n !== entry && !n.endsWith("/")),
  };
}

/** True when the picked file looks like an archive rather than a document. */
export function isArchive(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === "application/zip";
}
