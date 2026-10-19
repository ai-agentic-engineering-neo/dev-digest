/* SkillsEmptyState — right pane when the workspace has no skills. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useSkillsWorkspace } from "../../SkillsWorkspace";
import { s } from "./styles";

export function SkillsEmptyState() {
  const t = useTranslations("skills");
  const workspace = useSkillsWorkspace();
  return (
    <div style={s.wrap}>
      <div style={s.iconBox}>
        <Icon.Sparkles size={30} />
      </div>
      <h2 style={s.title}>{t("page.empty.title")}</h2>
      <p style={s.body}>{t("page.empty.body")}</p>
      <div style={s.actions}>
        <Button kind="primary" icon="Plus" onClick={() => workspace.open("create")}>
          {t("page.empty.cta")}
        </Button>
        <Button kind="secondary" icon="Upload" onClick={() => workspace.open("import")}>
          {t("page.importSkill")}
        </Button>
      </div>
    </div>
  );
}
