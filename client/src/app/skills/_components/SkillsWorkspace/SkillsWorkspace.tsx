/* SkillsWorkspace — the two-pane Skills screen shared by /skills and
   /skills/:id: skills list on the left, `children` (editor or empty state) on
   the right. Owns the create / import modals and the community drawer so both
   panes can open them. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { SkillsPane } from "./_components/SkillsPane";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { CommunityDrawer } from "./_components/CommunityDrawer";
import { s } from "./styles";

type Overlay = "create" | "import" | "community" | null;
type WorkspaceCtx = { open: (overlay: Exclude<Overlay, null>) => void };
const SkillsWorkspaceContext = React.createContext<WorkspaceCtx>({ open: () => {} });

/** Opens the create / import modal or the community drawer. */
export function useSkillsWorkspace(): WorkspaceCtx {
  return React.useContext(SkillsWorkspaceContext);
}

export function SkillsWorkspace({
  activeId,
  activeName,
  tab,
  children,
}: {
  activeId?: string;
  activeName?: string;
  /** Editor tab to keep when switching skills. */
  tab?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const ctx = React.useMemo<WorkspaceCtx>(() => ({ open: setOverlay }), []);
  const close = () => setOverlay(null);
  const openSkill = (sk: Skill) => {
    setOverlay(null);
    router.push(`/skills/${sk.id}?tab=config`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    activeName ? { label: t("page.crumbSkills"), href: "/skills" } : { label: t("page.crumbSkills") },
    ...(activeName ? [{ label: activeName }] : []),
  ];

  return (
    <SkillsWorkspaceContext.Provider value={ctx}>
      <AppShell crumb={crumb}>
        {overlay === "create" && <CreateSkillModal onClose={close} onCreated={openSkill} />}
        {overlay === "import" && <ImportSkillModal onClose={close} onImported={openSkill} />}
        {overlay === "community" && <CommunityDrawer onClose={close} />}
        <div style={s.layout}>
          <div style={s.pane}>
            <SkillsPane activeId={activeId} tab={tab} />
          </div>
          <div style={s.main}>{children}</div>
        </div>
      </AppShell>
    </SkillsWorkspaceContext.Provider>
  );
}
