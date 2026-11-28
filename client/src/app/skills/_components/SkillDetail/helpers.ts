import type { Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import type { SkillDraft } from "../../helpers";
import { DRAFT_FIELDS, NOT_FOUND_STATUS } from "./constants";

/** The draft fields whose value differs from the saved skill. */
export function changedSkillFields(saved: SkillDraft, draft: SkillDraft): Partial<SkillDraft> {
  const changed: Partial<SkillDraft> = {};
  for (const key of DRAFT_FIELDS) {
    if (draft[key] !== saved[key]) Object.assign(changed, { [key]: draft[key] });
  }
  return changed;
}

/** Whether any content field of the draft differs from the saved skill. */
export function isDirty(saved: SkillDraft, draft: SkillDraft): boolean {
  return Object.keys(changedSkillFields(saved, draft)).length > 0;
}

/** Whether a load error means the skill does not exist (as opposed to a failed request). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND_STATUS;
}

/** The version number the next save or restore creates. */
export function nextVersion(skill: Pick<Skill, "version">): number {
  return skill.version + 1;
}

/**
 * The in-app destination of a link click that would leave the current page,
 * or `null` when the click stays on it (same path, e.g. another tab of the
 * same skill) or goes to another origin.
 */
export function leavingHref(href: string, currentHref: string): string | null {
  const to = new URL(href, currentHref);
  const from = new URL(currentHref);
  if (to.origin !== from.origin || to.pathname === from.pathname) return null;
  return `${to.pathname}${to.search}${to.hash}`;
}
