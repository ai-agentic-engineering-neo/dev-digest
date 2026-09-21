/* AddSkillMenu — "Create", "Import from file", or "Import from URL". The
   Community import path already has copy in skills.json but belongs to a
   later lesson; it is deliberately NOT rendered here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";

export function AddSkillMenu({
  onCreate,
  onImport,
  onImportUrl,
}: {
  onCreate: () => void;
  onImport: () => void;
  onImportUrl: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <Dropdown
      width={200}
      align="right"
      trigger={
        <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
          {t("page.addSkill")}
        </Button>
      }
      items={[
        { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
        { label: t("page.menu.fromFile"), icon: "Upload", onClick: onImport },
        { label: t("page.menu.fromUrl"), icon: "Link", onClick: onImportUrl },
      ]}
    />
  );
}
