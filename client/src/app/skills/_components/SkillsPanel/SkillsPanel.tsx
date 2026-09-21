/* SkillsPanel — left column of /skills/[id]: title + Add Skill button, search and
   the skill rows with the open skill highlighted. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillRow, filterSkills } from "../SkillRow";
import { AddSkillModal } from "../AddSkillModal";
import { s } from "./styles";

export function SkillsPanel({ activeId, tab }: { activeId: string; tab: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading } = useSkills();
  const update = useUpdateSkill();
  const [adding, setAdding] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const all = skills ?? [];
  const list = filterSkills(all, search);

  return (
    <div style={s.wrap}>
      {adding && <AddSkillModal onClose={() => setAdding(false)} />}
      <div style={s.head}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setAdding(true)}>
            {t("page.addSkill")}
          </Button>
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <div style={s.scroll}>
        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={110} />
            <Skeleton height={110} />
          </div>
        )}
        {!isLoading && all.length > 0 && list.length === 0 && <div style={s.noMatch}>{t("page.noResults")}</div>}
        {list.map((sk) => (
          <SkillRow
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
            // Deleting the skill that is open on the right would leave a dead page — go back to the list.
            onDeleted={() => {
              if (sk.id === activeId) router.push("/skills");
            }}
          />
        ))}
      </div>
    </div>
  );
}
