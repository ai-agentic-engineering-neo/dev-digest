/* AddSkillMenu — "Add Skill ▾": Create from scratch, then the import entries,
   which are not built yet and render as disabled items with a "soon" hint. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import { IMPORT_ITEMS } from "./constants";

export function AddSkillMenu({ onCreate }: { onCreate: () => void }) {
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
        { label: t("page.menu.createFromScratch"), icon: "Edit", onClick: onCreate },
        { divider: true },
        ...IMPORT_ITEMS.map((it) => ({
          label: t(`page.menu.${it.labelKey}`),
          icon: it.icon,
          disabled: true,
          hint: t("page.menu.soon"),
        })),
      ]}
    />
  );
}
