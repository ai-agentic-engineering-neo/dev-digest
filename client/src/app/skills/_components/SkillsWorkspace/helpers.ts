import type { Skill } from "@devdigest/shared";

/** Case-insensitive match on name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => [sk.name, sk.description, sk.type].some((v) => v.toLowerCase().includes(q)));
}

/** Imported skills are someone else's instructions — flag them until vetted. */
export function needsVetting(skill: Pick<Skill, "source" | "enabled">): boolean {
  return skill.source !== "manual" && skill.source !== "extracted" && !skill.enabled;
}

/** Read a File as base64 (no data: prefix) for the JSON import endpoint. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
