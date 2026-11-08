import type { DevdigestDocErrorDetails, DevdigestNameRule } from "@/lib/types";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export function nameRuleText(t: Translate, rule: DevdigestNameRule): string {
  return t(`errors.invalidName.${rule}`);
}

/** Maps a server/client rejection to its user-facing text (all keys live in messages/en/context.json). */
export function reasonText(t: Translate, details: DevdigestDocErrorDetails): string {
  switch (details.reason) {
    case "invalid_name":
      return nameRuleText(t, details.rule ?? "empty");
    case "exists":
      return t("errors.exists", { path: details.path ?? "" });
    case "limit_reached":
      return t("errors.limitReached", { limit: details.limit ?? 0 });
    case "too_large":
      return t("errors.tooLarge");
    case "not_markdown":
      return t("errors.notMarkdown");
    case "not_text":
      return t("errors.notText");
  }
}

/** Devdigest-relative folder shown in tooltips: `.devdigest/specs/` or `.devdigest/specs/auth`. */
export function folderLabel(targetFolder: string): string {
  return `.devdigest/specs/${targetFolder}`;
}

export function childFolder(targetFolder: string, name: string): string {
  return targetFolder ? `${targetFolder}/${name}` : name;
}
