/* AddSkillModal — "+ Add Skill": one modal, three tabs (Create · From file · Import from URL).
   Every tab stays mounted (hidden when inactive) so half-typed work survives a tab switch.
   After any successful add we toast, warn if the server flagged prompt injection, close and
   open the new skill's Config tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { CreateTab } from "./_components/CreateTab";
import { FromFileTab } from "./_components/FromFileTab";
import { FromUrlTab } from "./_components/FromUrlTab";
import { MODAL_WIDTH, TAB_KEYS, type AddSkillTabKey } from "./constants";
import type { AddedKind } from "./types";
import { s } from "./styles";

export interface AddSkillModalProps {
  onClose: () => void;
  /** Called with the saved skill after a successful create/import (before navigation). */
  onAdded?: (skill: Skill) => void;
}

export function AddSkillModal({ onClose, onAdded }: AddSkillModalProps) {
  const t = useTranslations("skillsImport");
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState<AddSkillTabKey>("create");

  const handleAdded = (skill: Skill, kind: AddedKind) => {
    toast.success(t(`toast.${kind}`, { name: skill.name }));
    if (skill.injection_detected) toast.error(t("toast.injection", { name: skill.name }));
    onAdded?.(skill);
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  const tabs = TAB_KEYS.map((key) => ({ key, label: t(`tabs.${key}`) }));

  return (
    <Modal width={MODAL_WIDTH} title={t("title")} onClose={onClose}>
      <div style={s.tabsBar}>
        {tabs.map((x) => (
          <button key={x.key} type="button" aria-pressed={tab === x.key} onClick={() => setTab(x.key)} style={s.tab(tab === x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={t("tabs.create")} hidden={tab !== "create"} style={s.panel}>
        <CreateTab onAdded={handleAdded} />
      </div>
      <div role="tabpanel" aria-label={t("tabs.file")} hidden={tab !== "file"} style={s.panel}>
        <FromFileTab onAdded={handleAdded} />
      </div>
      <div role="tabpanel" aria-label={t("tabs.url")} hidden={tab !== "url"} style={s.panel}>
        <FromUrlTab onAdded={handleAdded} />
      </div>
    </Modal>
  );
}
