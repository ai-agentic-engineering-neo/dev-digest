/* SkillSidebar — the skill list on /skills/:id (like the agent editor's): the
   Add Skill menu and one SkillListItem per skill, the open one highlighted.
   Opening a skill (a row or a just-created one) goes through onOpen, which the
   workspace guards while the draft is dirty. Deleting the open skill → /skills. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSkills } from "@/lib/hooks";
import { skillsHref } from "@/app/skills/helpers";
import { AddSkillMenu } from "@/app/skills/_components/AddSkillMenu";
import { SkillListItem } from "./_components/SkillListItem";
import { s } from "./styles";

export function SkillSidebar({ activeId, onOpen }: { activeId: string; onOpen: (id: string) => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills } = useSkills();

  return (
    <aside style={s.sidebar} aria-label={t("editor.listTitle")}>
      <div style={s.header}>
        <h1 style={s.title}>{t("editor.listTitle")}</h1>
        <AddSkillMenu onOpen={onOpen} />
      </div>
      <div style={s.list}>
        {(skills ?? []).map((sk) => (
          <SkillListItem
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onOpen={onOpen}
            onDeleted={() => sk.id === activeId && router.push(skillsHref())}
          />
        ))}
      </div>
    </aside>
  );
}
