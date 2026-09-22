/* CommunitySkillsDrawer — search the curated catalog shipped in the server
   (GET /skills/community?q=&tag=), then Import → preview (nothing saved yet). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, Drawer, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useCommunitySkills, useImportPreview } from "@/lib/hooks";
import { catalogTags } from "./helpers";
import { s } from "./styles";

export function CommunitySkillsDrawer({
  onClose,
  onPreview,
}: {
  onClose: () => void;
  onPreview: (preview: SkillImportPreview) => void;
}) {
  const t = useTranslations("skills");
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const query = React.useDeferredValue(q);
  const catalog = useCommunitySkills({});
  const results = useCommunitySkills({ q: query, tag: tag ?? undefined });
  const preview = useImportPreview();
  const importingId = preview.isPending && preview.variables?.kind === "community" ? preview.variables.id : undefined;

  const importOne = (id: string) => preview.mutate({ kind: "community", id }, { onSuccess: onPreview });

  return (
    <Drawer width={640} title={t("community.title")} subtitle={t("community.subtitle")} onClose={onClose}>
      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("community.searchPlaceholder")}
          aria-label={t("community.searchPlaceholder")}
          style={s.searchInput}
        />
      </div>
      <div style={s.chips}>
        <Chip active={tag === null} onClick={() => setTag(null)}>
          {t("community.allTags")}
        </Chip>
        {catalogTags(catalog.data).map((tg) => (
          <Chip key={tg} active={tag === tg} onClick={() => setTag(tg)}>
            {tg}
          </Chip>
        ))}
      </div>

      {preview.isError && (
        <div role="alert" style={s.error}>
          {t("community.importError", { message: preview.error.message })}
        </div>
      )}
      {results.isLoading && <Skeleton height={120} />}
      {results.isError && (
        <ErrorState title={t("community.loadError")} onRetry={() => results.refetch()} retryLabel={t("community.retry")} />
      )}
      {results.data && results.data.length === 0 && (
        <EmptyState icon="Search" title={t("community.empty.title")} body={t("community.empty.body")} />
      )}
      <ul style={s.list}>
        {results.data?.map((cs) => (
          <li key={cs.id} style={s.row}>
            <div style={s.rowMain}>
              <div style={s.rowTitle}>
                <span className="mono" style={s.name}>
                  {cs.name}
                </span>
                <SkillTypeBadge type={cs.type} />
              </div>
              <div style={s.desc}>{cs.desc}</div>
              <div style={s.rowMeta}>
                <span className="mono">{cs.repo}</span>
                <span>{t("community.stars", { count: cs.stars })}</span>
                <span>{cs.lang}</span>
              </div>
            </div>
            <Button
              kind="secondary"
              size="sm"
              icon="Upload"
              onClick={() => importOne(cs.id)}
              disabled={preview.isPending}
              aria-label={`${t("community.import")} ${cs.name}`}
            >
              {importingId === cs.id ? t("community.importing") : t("community.import")}
            </Button>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
