/* CommunityDrawer — "Search community skills" entry point. The vetted
   community catalog ships in a later lesson; until then the drawer is a
   mount point (out of scope for L02, see specs/skills.md §6). */
"use client";

import { useTranslations } from "next-intl";
import { Drawer, EmptyState } from "@devdigest/ui";
import { COMMUNITY_DRAWER_WIDTH } from "./constants";

export function CommunityDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  return (
    <Drawer width={COMMUNITY_DRAWER_WIDTH} title={t("community.title")} subtitle={t("community.subtitle")} onClose={onClose}>
      <EmptyState icon="Globe" title={t("community.mountTitle")} body={t("community.mountBody")} />
    </Drawer>
  );
}
