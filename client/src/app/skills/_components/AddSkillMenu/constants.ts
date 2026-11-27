import type { IconName } from "@devdigest/ui";
import type { AddSkillTab } from "../CreateSkillModal/constants";

/** Import entries below the divider: each opens the Add skill dialog on its tab. */
export const IMPORT_ITEMS: readonly { labelKey: "fromFile" | "fromUrl"; icon: IconName; tab: AddSkillTab }[] = [
  { labelKey: "fromFile", icon: "Upload", tab: "file" },
  { labelKey: "fromUrl", icon: "Link", tab: "url" },
];

/** Not built yet: rendered disabled with a "soon" hint (SPEC §3.1, §6). */
export const SOON_ITEMS: readonly { labelKey: "community"; icon: IconName }[] = [
  { labelKey: "community", icon: "Globe" },
];
