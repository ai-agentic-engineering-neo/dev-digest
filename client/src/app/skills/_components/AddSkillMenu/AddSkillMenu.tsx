/* AddSkillMenu — the one way a skill gets created, shared by the library page
   and the detail page's rail so both offer the same two routes in (write one,
   or import one) rather than drifting apart. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Button, Dropdown } from "@devdigest/ui";
import { SkillEditorModal } from "../SkillEditorModal";
import { ImportSkillDrawer } from "../ImportSkillDrawer";
import { MENU_WIDTH } from "./constants";

export interface AddSkillFlow {
  openCreate: () => void;
  openImport: () => void;
  /** Mount this once in the page; it renders whichever dialog is open. */
  modals: React.ReactNode;
}

/**
 * Owns the create/import dialogs.
 *
 * Split from the button because the library page has a second trigger — the
 * empty state's call to action — and both must drive the same dialog rather
 * than each mounting their own copy of the editor.
 */
export function useAddSkillFlow(onCreated: (skill: Skill) => void): AddSkillFlow {
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  return {
    openCreate: () => setCreating(true),
    openImport: () => setImporting(true),
    modals: (
      <>
        {creating && (
          <SkillEditorModal onClose={() => setCreating(false)} onSaved={onCreated} />
        )}
        {importing && (
          <ImportSkillDrawer onClose={() => setImporting(false)} onImported={onCreated} />
        )}
      </>
    ),
  };
}

export function AddSkillMenu({
  flow,
  size = "sm",
}: {
  flow: AddSkillFlow;
  size?: "sm" | "md";
}) {
  const t = useTranslations("skills");

  return (
    <Dropdown
      width={MENU_WIDTH}
      align="right"
      trigger={
        <Button kind="primary" size={size} icon="Plus" iconRight="ChevronDown">
          {t("page.addSkill")}
        </Button>
      }
      items={[
        { label: t("page.menu.create"), icon: "Edit", onClick: flow.openCreate },
        { divider: true },
        { label: t("page.menu.fromFile"), icon: "Upload", onClick: flow.openImport },
      ]}
    />
  );
}
