import type { ImportSkillUrlBody, SkillType } from "@devdigest/shared";

/** True for a parseable `https:` URL without embedded credentials (the server re-validates). */
export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

/** `POST /skills/import-url` body; a blank name is omitted so the server derives it. */
export function buildUrlPayload(url: string, name: string, type: SkillType): ImportSkillUrlBody {
  const trimmedName = name.trim();
  return { url: url.trim(), ...(trimmedName ? { name: trimmedName } : {}), type };
}
