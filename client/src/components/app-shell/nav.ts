/* Registers the Skills sidebar item. The nav list lives in vendored
   `@devdigest/ui` (do not edit); the sidebar reads the exported NAV array by
   reference, so the app extends it here, once, idempotently. */
import { NAV } from "@devdigest/ui";

const SKILLS_LAB_SECTION = "SKILLS LAB";

export function registerSkillsNav(): void {
  const present = NAV.some((g) => g.items.some((it) => it.key === "skills"));
  if (present) return;
  NAV.push({
    section: SKILLS_LAB_SECTION,
    items: [{ key: "skills", label: "Skills", icon: "Zap", href: "/skills", gKey: "s" }],
  });
}

registerSkillsNav();
