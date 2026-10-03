/* /skills/:id — Skill detail/edit page. Left skill list + editor, mirrors
   /agents/:id's two-pane shell + top bar exactly. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { SkillCard } from "../_components/SkillCard";
import { SkillDetail } from "./_components/SkillDetail";
import { useSkills, useSkill, useUpdateSkill } from "../../../lib/hooks/skills";
import { useRunAllEvalCases } from "../../../lib/hooks/evals";
import { ApiError } from "../../../lib/api";

const VALID_TABS = ["config", "context", "preview", "evals", "stats", "versions"];

export default function SkillDetailPage() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const runAll = useRunAllEvalCases();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.notFound.body")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ padding: "16px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{t("page.heading")}</h1>
            </div>
            <a
              href="/skills"
              onClick={(e) => {
                e.preventDefault();
                router.push("/skills");
              }}
              style={{ fontSize: 13, color: "var(--text-secondary)" }}
            >
              {t("detail.back")}
            </a>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "12px 12px 12px" }}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                sk={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color="var(--accent-text, var(--accent))" mono>
                {t(`listItem.type.${skill.type}`)}
              </Badge>
              <Badge color="var(--text-secondary)" mono>
                {t("preview.version", { version: skill.version })}
              </Badge>
              <div style={{ marginLeft: "auto" }}>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="Play"
                  onClick={() => runAll.mutate({ ownerKind: "skill", ownerId: skill.id })}
                  disabled={runAll.isPending}
                >
                  {t("runOnEvals")}
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillDetail skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
