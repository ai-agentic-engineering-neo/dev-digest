/* AddSkillMenu — "Add Skill ▾": Create from scratch, Import from file, Import
   from URL (each opens the Add skill dialog on that tab), then community search,
   which is not built yet and renders as a disabled item with a "soon" hint. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import type { AddSkillTab } from "../CreateSkillModal/constants";
import { IMPORT_ITEMS, SOON_ITEMS } from "./constants";

export function AddSkillMenu({ onCreate }: { onCreate: (tab: AddSkillTab) => void }) {
  const t = useTranslations("skills");
  return (
    <Dropdown
      width={250}
      align="right"
      trigger={
        <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
          {t("page.addSkill")}
        </Button>
      }
      items={[
        { label: t("page.menu.createFromScratch"), icon: "Edit", onClick: () => onCreate("create") },
        { divider: true },
        ...IMPORT_ITEMS.map((it) => ({
          label: t(`page.menu.${it.labelKey}`),
          icon: it.icon,
          onClick: () => onCreate(it.tab),
        })),
        ...SOON_ITEMS.map((it) => ({
          label: t(`page.menu.${it.labelKey}`),
          icon: it.icon,
          disabled: true,
          hint: t("page.menu.soon"),
        })),
      ]}
    />
  );
}
