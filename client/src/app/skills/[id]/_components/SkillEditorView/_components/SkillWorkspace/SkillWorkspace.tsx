/* SkillWorkspace — a loaded skill on /skills/:id: the sidebar + header + tabbed
   SkillEditor. It owns the draft (keyed by skill id by its parent) and both
   guards on leaving it: links (useUnsavedChangesGuard) and the router.push of
   opening another skill from the sidebar or the Add Skill menu (open). */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import type { SkillTab } from "@/app/skills/constants";
import { SkillEditor, useSkillDraft, useUnsavedChangesGuard } from "../../../SkillEditor";
import { SkillSidebar } from "../SkillSidebar";
import { s } from "./styles";

export function SkillWorkspace({
  skill,
  tab,
  onTab,
  onGo,
}: {
  skill: Skill;
  tab: SkillTab;
  onTab: (tab: SkillTab) => void;
  onGo: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const draft = useSkillDraft(skill);
  const unsavedConfirm = t("editor.unsavedConfirm");
  useUnsavedChangesGuard(draft.dirty, unsavedConfirm);

  const open = (id: string) => {
    if (id === skill.id || (draft.dirty && !window.confirm(unsavedConfirm))) return;
    onGo(id);
  };

  return (
    <>
      <SkillSidebar activeId={skill.id} onOpen={open} />
      <div style={s.main}>
        <div style={s.header}>
          <Icon.Sparkles size={18} style={s.icon} />
          <h2 className="mono" style={s.title}>
            {skill.name}.md
          </h2>
          <SkillTypeBadge type={skill.type} />
          <Badge color="var(--text-secondary)" mono>
            v{skill.version}
          </Badge>
          {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
        </div>
        <div style={s.editorScroll}>
          <SkillEditor skill={skill} draft={draft} tab={tab} onTab={onTab} />
        </div>
      </div>
    </>
  );
}
