/* AgentsWorkspace — the two-pane Agents screen shared by /agents and
   /agents/:id: agents list on the left, `children` (editor or empty state) on
   the right. Owns the create-agent modal so both panes can open it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "../../../../components/app-shell";
import { AgentsPane } from "./_components/AgentsPane";
import { CreateAgentModal } from "./_components/CreateAgentModal";
import { s } from "./styles";

type CreateCtx = { open: (template?: string) => void };
const CreateAgentContext = React.createContext<CreateCtx>({ open: () => {} });

/** Opens the create-agent modal (optionally prefilled from a template). */
export function useCreateAgentModal(): CreateCtx {
  return React.useContext(CreateAgentContext);
}

export function AgentsWorkspace({
  activeId,
  activeName,
  tab,
  children,
}: {
  activeId?: string;
  activeName?: string;
  /** Editor tab to keep when switching agents. */
  tab?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("agents");
  const [creating, setCreating] = React.useState<{ template?: string } | null>(null);
  const ctx = React.useMemo<CreateCtx>(() => ({ open: (template) => setCreating({ template }) }), []);

  const crumb = [
    { label: t("list.breadcrumbLab") },
    activeName ? { label: t("list.breadcrumb"), href: "/agents" } : { label: t("list.breadcrumb") },
    ...(activeName ? [{ label: activeName }] : []),
  ];

  return (
    <CreateAgentContext.Provider value={ctx}>
      <AppShell crumb={crumb}>
        {creating && (
          <CreateAgentModal
            onClose={() => setCreating(null)}
            initialName={creating.template ? t("list.templateName", { template: creating.template }) : ""}
          />
        )}
        <div style={s.layout}>
          <div style={s.pane}>
            <AgentsPane activeId={activeId} tab={tab} />
          </div>
          <div style={s.main}>{children}</div>
        </div>
      </AppShell>
    </CreateAgentContext.Provider>
  );
}
