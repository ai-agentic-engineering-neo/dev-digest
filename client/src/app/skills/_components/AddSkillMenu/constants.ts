import type { IconName } from "@devdigest/ui";

/** Import entries shown disabled ("soon") below the divider — a later milestone (SPEC §3.1, §6). */
export const IMPORT_ITEMS: readonly { labelKey: "fromFile" | "fromUrl" | "community"; icon: IconName }[] = [
  { labelKey: "fromFile", icon: "Upload" },
  { labelKey: "fromUrl", icon: "Link" },
  { labelKey: "community", icon: "Globe" },
];
