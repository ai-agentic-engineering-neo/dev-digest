"use client";

import { useTranslations } from "next-intl";
import { symbolDisplayName } from "@/components/graph-canvas";
import type { BlastGraphNode } from "@devdigest/shared";
import { MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

interface NodeDetailProps {
  node: BlastGraphNode | null;
  line?: number;
  repoFullName?: string | null;
  headSha?: string | null;
  onClose: () => void;
}

/** Detail panel for the selected node — plain text only; link pinned to the PR head SHA. */
export function NodeDetail({ node, line, repoFullName, headSha, onClose }: NodeDetailProps) {
  const t = useTranslations("impactGraph");
  const tCanvas = useTranslations("graph");
  if (!node) return <div style={s.detail}>{t("detail.none")}</div>;

  const href = repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, node.path, line, line) : undefined;
  return (
    <section style={s.detail} aria-label={t("detail.title")}>
      <div style={s.detailHead}>
        <span style={s.detailTitle}>{t("detail.title")}</span>
        <button type="button" onClick={onClose} aria-label={t("detail.close")}>
          ×
        </button>
      </div>
      <dl style={s.dl}>
        <dt>{t("detail.symbol")}</dt>
        <dd style={s.dd}>{symbolDisplayName(node.name, tCanvas("moduleScope"))}</dd>
        <dt>{t("detail.file")}</dt>
        <dd style={s.dd}>
          <MonoLink href={href}>
            {node.path}
            {line != null ? `:${line}` : ""}
          </MonoLink>
        </dd>
        <dt>{t("detail.kind")}</dt>
        <dd style={s.dd}>{node.symbolKind ?? (node.kind === "file" ? t("detail.kindFile") : t("detail.kindSymbol"))}</dd>
        <dt>{t("detail.role")}</dt>
        <dd style={s.dd}>{t(`role.${node.role}`)}</dd>
        <dt>{t("detail.depth")}</dt>
        <dd style={s.dd}>{node.depth}</dd>
      </dl>
    </section>
  );
}
