import type { Convention } from "@devdigest/shared";
import { SKILL_NAME_MAX } from "@devdigest/shared/constants/skills";
import { evidenceLabel } from "../../helpers";

/** Max words of a rule kept in its `##` heading slug. */
const RULE_SLUG_WORDS = 5;
const RULE_SLUG_MAX = 48;

/** Fence language by file extension (no language → plain fence). */
const LANG_BY_EXT: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  json: "json",
  jsonc: "jsonc",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "md",
  sql: "sql",
  sh: "bash",
};

/** Kebab slug of free text (lowercase ASCII letters/digits, single dashes). */
export function slugify(text: string, maxLength = SKILL_NAME_MAX): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
}

/** Default skill name: `<repo-name>-conventions`, kept within the name limit. */
export function defaultSkillName(repoName: string): string {
  const suffix = "-conventions";
  const base = slugify(repoName, SKILL_NAME_MAX - suffix.length);
  return base ? `${base}${suffix}` : "repo-conventions";
}

/** Heading slug of a rule: its first words, e.g. `always-use-async-await-instead-of`. */
export function ruleSlug(rule: string): string {
  return slugify(rule.split(/\s+/).slice(0, RULE_SLUG_WORDS).join(" "), RULE_SLUG_MAX) || "rule";
}

export function fenceLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return path.includes(".") ? (LANG_BY_EXT[ext] ?? "") : "";
}

/** A fence longer than any backtick run in the snippet, so it can't close early. */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** Headings must stay distinct: a repeated slug gets `-2`, `-3`, … */
export function uniqueSlugs(slugs: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return slugs.map((slug) => {
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    return n === 1 ? slug : `${slug}-${n}`;
  });
}

/** One rule section: heading, rule text, primary evidence with its real lines. */
function ruleSection(c: Convention, slug: string): string {
  const lines = [`## ${c.category}: ${slug}`, c.rule.trim()];
  const e = c.evidence[0];
  if (e) {
    const fence = fenceFor(e.snippet);
    lines.push("", `Detected in \`${evidenceLabel(e)}\`:`, `${fence}${fenceLang(e.path)}`, e.snippet.replace(/\n+$/, ""), fence);
  }
  return lines.join("\n");
}

/**
 * The skill body draft the modal opens with (client/specs/04-conventions.md):
 * deterministic, no model — the user edits it before saving. Prompt text, not
 * UI copy, so it is not translated.
 */
export function buildSkillDraft(name: string, repoName: string, conventions: readonly Convention[]): string {
  const intro = `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = [`# ${name}`, intro, ...uniqueSlugs(conventions.map((c) => ruleSlug(c.rule))).map((slug, i) => ruleSection(conventions[i]!, slug))];
  return `${sections.join("\n\n")}\n`;
}
