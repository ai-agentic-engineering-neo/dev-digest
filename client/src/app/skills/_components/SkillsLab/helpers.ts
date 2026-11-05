import type { Skill } from "@devdigest/shared";
import type { SkillInput } from "../../../../lib/hooks/skills";
import { DEFAULT_TAB, SKILL_NAME_PATTERN, TAB_KEYS, type SkillTab } from "./constants";

/** Case-insensitive match on name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (sk) =>
      sk.name.toLowerCase().includes(q) ||
      sk.description.toLowerCase().includes(q) ||
      sk.type.includes(q),
  );
}

/** Imported / community skills are untrusted third-party text. */
export function isImportedSkill(skill: Pick<Skill, "source">): boolean {
  return skill.source === "community" || skill.source === "imported_url";
}

export function parseTab(raw: string | null): SkillTab {
  return (TAB_KEYS as readonly string[]).includes(raw ?? "") ? (raw as SkillTab) : DEFAULT_TAB;
}

export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}

/** The form can be submitted when every field is present and the name is kebab-case. */
export function canSubmitSkill(form: Pick<SkillInput, "name" | "description" | "body">): boolean {
  return isValidSkillName(form.name) && form.description.trim().length > 0 && form.body.trim().length > 0;
}

/** Only the content fields that changed vs the saved skill (empty → nothing to save). */
export function skillPatch(skill: Skill, form: SkillInput): Partial<SkillInput> {
  const patch: Partial<SkillInput> = {};
  if (form.name !== skill.name) patch.name = form.name;
  if (form.description.trim() !== skill.description) patch.description = form.description.trim();
  if (form.type !== skill.type) patch.type = form.type;
  if (form.body !== skill.body) patch.body = form.body;
  return patch;
}

/** 0.74 → "74%"; null → "—". */
export function formatPct(rate: number | null | undefined): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Rough token estimate (~4 chars per token), same heuristic as the run trace. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/**
 * Line diff (LCS) of `from` → `to` for the Versions "Diff" modal. Skill bodies
 * are small (≤ 50k chars), so the O(n·m) table is fine.
 */
export function lineDiff(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++]! });
  while (j < b.length) out.push({ kind: "add", text: b[j++]! });
  return out;
}
