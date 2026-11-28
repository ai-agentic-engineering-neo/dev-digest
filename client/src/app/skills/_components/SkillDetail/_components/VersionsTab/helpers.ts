import type { Skill, SkillVersion } from "@devdigest/shared";

/** `YYYY-MM-DD` of an ISO timestamp. */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Whether a history row is the skill's current version. */
export function isCurrentVersion(v: Pick<SkillVersion, "version">, skill: Pick<Skill, "version">): boolean {
  return v.version === skill.version;
}

/** Versions newest first (the server already orders them; this keeps the UI safe). */
export function newestFirst(versions: SkillVersion[]): SkillVersion[] {
  return [...versions].sort((a, b) => b.version - a.version);
}
