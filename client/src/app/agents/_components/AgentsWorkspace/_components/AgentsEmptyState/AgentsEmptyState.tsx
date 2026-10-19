/* AgentsEmptyState — right pane when the workspace has no agents. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Dropdown, Icon } from "@devdigest/ui";
import { useCreateAgentModal } from "../../AgentsWorkspace";
import { TEMPLATES } from "../../constants";
import { s } from "./styles";

export function AgentsEmptyState() {
  const t = useTranslations("agents");
  const create = useCreateAgentModal();
  return (
    <div style={s.wrap}>
      <div style={s.iconBox}>
        <Icon.Cpu size={30} />
      </div>
      <h2 style={s.title}>{t("list.emptyTitle")}</h2>
      <p style={s.body}>{t("list.emptyBody")}</p>
      <div style={s.actions}>
        <Button kind="primary" icon="Plus" onClick={() => create.open()}>
          {t("list.emptyCta")}
        </Button>
        <Dropdown
          width={220}
          trigger={
            <Button kind="secondary" iconRight="ChevronDown">
              {t("list.startFromTemplate")}
            </Button>
          }
          items={TEMPLATES.map((tp) => ({
            label: t("list.templateName", { template: tp }),
            icon: "Cpu" as const,
            onClick: () => create.open(tp),
          }))}
        />
      </div>
    </div>
  );
}
