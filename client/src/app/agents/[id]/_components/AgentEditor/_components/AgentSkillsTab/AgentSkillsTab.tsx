/* Skills tab of the agent editor: attach, enable per agent, and reorder skills.
   Order = order of the skill blocks in the assembled prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import {
  getErrorMessage,
  useAgentSkills,
  useSetAgentSkills,
  useSkills,
  useUnlinkAgentSkill,
  useUpdateAgentSkillLink,
} from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR, filterSkills } from "@/lib/skills";
import { useToast } from "@/lib/toast";
import { enabledTokens, joinLinks, moveById, moveToTarget } from "./helpers";
import { s } from "./styles";

export function AgentSkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const toast = useToast();
  const links = useAgentSkills(agentId);
  const skills = useSkills();
  const setSkills = useSetAgentSkills(agentId);
  const updateLink = useUpdateAgentSkillLink(agentId);
  const unlink = useUnlinkAgentSkill(agentId);
  const [filter, setFilter] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (links.isError || skills.isError) {
    return <ErrorState body={t("skillsTab.loadError")} onRetry={() => { links.refetch(); skills.refetch(); }} />;
  }
  if (links.isLoading || skills.isLoading) return <Skeleton height={120} />;

  const rows = joinLinks(links.data ?? [], skills.data ?? []);
  const ids = rows.map((r) => r.skill.id);
  const visibleIds = new Set(filterSkills(rows.map((r) => r.skill), filter).map((sk) => sk.id));
  const enabledCount = rows.filter((r) => r.link.enabled).length;
  const tokens = enabledTokens(rows);
  const linked = new Set(ids);
  const unlinked = (skills.data ?? []).filter((sk) => !linked.has(sk.id));

  const onError = (err: unknown) => toast.error(getErrorMessage(err, t("skillsTab.updateFailed")));
  const reorder = (next: string[]) => {
    if (next.join() !== ids.join()) setSkills.mutate(next, { onError });
  };

  return (
    <div>
      <div style={s.head}>
        <h2 style={s.title}>{t("skillsTab.title")}</h2>
        <Badge>{t("skillsTab.enabledCount", { enabled: enabledCount, total: rows.length })}</Badge>
        <div style={s.spacer} />
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            aria-label={t("skillsTab.filterPlaceholder")}
            placeholder={t("skillsTab.filterPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={s.filterInput}
          />
        </div>
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setPicking((p) => !p)}>
          {t("skillsTab.addSkill")}
        </Button>
      </div>
      <p style={s.hint}>{t("skillsTab.orderHint")}</p>
      {tokens > 0 && <div style={s.tokens}>{t("skillsTab.tokens", { count: tokens })}</div>}

      {rows.length === 0 ? (
        <EmptyState icon="Zap" title={t("skillsTab.title")} body={t("skillsTab.empty")} />
      ) : (
        <ul style={s.list}>
          {rows.map(({ link, skill }, i) =>
            !visibleIds.has(skill.id) ? null : (
              <li
                key={skill.id}
                draggable
                onDragStart={(e) => {
                  setDragId(skill.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", skill.id);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOverId(skill.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) reorder(moveToTarget(ids, dragId, skill.id));
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                style={{ ...s.row, ...(overId === skill.id && dragId !== skill.id ? s.rowOver : null) }}
              >
                <span aria-hidden style={s.handle} title={t("skillsTab.dragHandle", { name: skill.name })}>
                  ⋮⋮
                </span>
                <input
                  type="checkbox"
                  aria-label={t("skillsTab.enable", { name: skill.name })}
                  checked={link.enabled}
                  onChange={(e) =>
                    updateLink.mutate({ skillId: skill.id, patch: { enabled: e.target.checked } }, { onError })
                  }
                />
                <span className="mono" style={s.name} title={skill.name}>
                  {skill.name}
                </span>
                {!skill.enabled && <Badge color="var(--text-muted)">{t("skillsTab.globallyOff")}</Badge>}
                <Badge color={SKILL_TYPE_COLOR[skill.type]}>{ts(`listItem.type.${skill.type}`)}</Badge>
                <IconBtn
                  icon="ArrowUp"
                  label={t("skillsTab.moveUp", { name: skill.name })}
                  onClick={i === 0 ? undefined : () => reorder(moveById(ids, skill.id, -1))}
                />
                <IconBtn
                  icon="ArrowDown"
                  label={t("skillsTab.moveDown", { name: skill.name })}
                  onClick={i === rows.length - 1 ? undefined : () => reorder(moveById(ids, skill.id, 1))}
                />
                <IconBtn
                  icon="X"
                  label={t("skillsTab.unlink", { name: skill.name })}
                  onClick={() => unlink.mutate(skill.id, { onError })}
                />
              </li>
            ),
          )}
        </ul>
      )}

      {picking && (
        <div style={s.picker}>
          {unlinked.length === 0 && <div style={s.muted}>{t("skillsTab.addNone")}</div>}
          {unlinked.map((sk) => (
            <div key={sk.id} style={s.pickerRow}>
              <span className="mono" style={s.name}>
                {sk.name}
              </span>
              <Badge color={SKILL_TYPE_COLOR[sk.type]}>{ts(`listItem.type.${sk.type}`)}</Badge>
              <Button kind="secondary" size="sm" onClick={() => setSkills.mutate([...ids, sk.id], { onError })}>
                {t("skillsTab.add")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
