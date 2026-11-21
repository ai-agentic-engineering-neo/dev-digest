"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { symbolDisplayName } from "@/components/graph-canvas";
import type { BlastGraphEdge, BlastGraphNode } from "@devdigest/shared";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { ROLE_META } from "./constants";
import type { Neighbour, NodeNeighbours } from "./helpers";
import { s } from "./styles";

/** Neighbour lists longer than this collapse behind a "Show all" toggle. */
const LIST_PREVIEW = 6;

interface NodeDetailProps {
  node: BlastGraphNode | null;
  line?: number;
  neighbours: NodeNeighbours | null;
  /** Ordered chain selected → … → changed; `[]` when none is reachable. */
  path: BlastGraphNode[];
  repoFullName?: string | null;
  headSha?: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Opens the file in the Files tab (only offered for changed code). */
  onFocusFile?: (file: string, line: number | null) => void;
}

/** Side panel for the selected graph node — plain text only; links pinned to the PR head SHA. */
export function NodeDetail({
  node,
  line,
  neighbours,
  path,
  repoFullName,
  headSha,
  onSelect,
  onClose,
  onFocusFile,
}: NodeDetailProps) {
  const t = useTranslations("impactGraph");
  const tCanvas = useTranslations("graph");
  const display = (n: BlastGraphNode) => symbolDisplayName(n.name, tCanvas("moduleScope"));

  if (!node) {
    return (
      <aside style={s.detailEmpty} aria-label={t("detail.title")}>
        <Icon.Target size={18} style={{ color: "var(--text-muted)" }} />
        <span>{t("detail.none")}</span>
      </aside>
    );
  }

  const meta = ROLE_META[node.role];
  const RoleIcon = Icon[meta.icon];
  const href = repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, node.path, line, line) : undefined;
  const kind = node.symbolKind ?? (node.kind === "file" ? t("detail.kindFile") : t("detail.kindSymbol"));

  return (
    <aside style={s.detail} aria-label={t("detail.title")}>
      <header style={s.detailHead}>
        <span style={s.roleIcon(meta.color, meta.bg)} aria-hidden>
          <RoleIcon size={14} />
        </span>
        <div style={s.detailTitleWrap}>
          <span
            className="mono"
            style={{ ...s.detailTitle, textDecoration: node.deleted ? "line-through" : undefined }}
            title={display(node)}
          >
            {display(node)}
          </span>
          <div style={s.detailTags}>
            <Badge color={meta.color} bg={meta.bg}>
              {t(`role.${node.role}`)}
            </Badge>
            <Badge>{kind}</Badge>
            {node.typeOnly && <Badge>{t("list.typeOnly")}</Badge>}
            {node.deleted && (
              <Badge color="var(--crit)" bg="var(--crit-bg)">
                {t("list.deleted")}
              </Badge>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={t("detail.close")} style={s.iconBtn}>
          <Icon.XCircle size={16} />
        </button>
      </header>

      <div style={s.depthLine}>{t("detail.hops", { count: node.depth })}</div>

      {node.entryLabel && (
        <div style={s.detailRow}>
          <Badge icon="Globe" color="var(--ok)" bg="var(--ok-bg)" mono>
            {node.entryLabel}
          </Badge>
        </div>
      )}

      <div style={s.fileBox}>
        <span style={s.fileLink} title={`${node.path}${line != null ? `:${line}` : ""}`}>
          <MonoLink href={href}>
            {node.path}
            {line != null ? `:${line}` : ""}
          </MonoLink>
        </span>
        <div style={s.fileActions}>
          {href && (
            <a href={href} target="_blank" rel="noreferrer noopener" style={s.actionLink}>
              <Icon.ExternalLink size={12} /> {t("detail.github")}
            </a>
          )}
          {onFocusFile && node.role === "changed" && !node.deleted && (
            <button type="button" style={s.actionBtn} onClick={() => onFocusFile(node.path, line ?? null)}>
              <Icon.Code size={12} /> {t("detail.showInDiff")}
            </button>
          )}
        </div>
      </div>

      {node.role !== "changed" && (
        <section style={s.detailSection}>
          <h4 style={s.detailSectionTitle}>{t("detail.pathToChanged")}</h4>
          {path.length === 0 ? (
            <p style={s.muted}>{t("detail.noPath")}</p>
          ) : (
            <ol style={s.chain}>
              {path.map((p, i) => (
                <li key={p.id} style={s.chainItem}>
                  <span style={s.chainDot(ROLE_META[p.role].color, i === 0)} aria-hidden />
                  <button
                    type="button"
                    style={s.chainBtn}
                    disabled={p.id === node.id}
                    onClick={() => onSelect(p.id)}
                    title={p.path}
                  >
                    <span className="mono">{display(p)}</span>
                    <span style={s.chainPath}>{p.path}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <NeighbourList
        title={t("detail.usedBy", { count: neighbours?.dependents.length ?? 0 })}
        empty={t("detail.noDependents")}
        items={neighbours?.dependents ?? []}
        display={display}
        onSelect={onSelect}
      />
      <NeighbourList
        title={t("detail.dependsOn", { count: neighbours?.dependencies.length ?? 0 })}
        empty={t("detail.noDependencies")}
        items={neighbours?.dependencies ?? []}
        display={display}
        onSelect={onSelect}
      />
    </aside>
  );
}

function NeighbourList({
  title,
  empty,
  items,
  display,
  onSelect,
}: {
  title: string;
  empty: string;
  items: Neighbour[];
  display: (n: BlastGraphNode) => string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("impactGraph");
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIST_PREVIEW);
  return (
    <section style={s.detailSection}>
      <h4 style={s.detailSectionTitle}>{title}</h4>
      {items.length === 0 ? (
        <p style={s.muted}>{empty}</p>
      ) : (
        <ul style={s.nbList}>
          {shown.map((nb) => {
            const meta = ROLE_META[nb.node.role];
            const NbIcon = Icon[meta.icon];
            return (
              <li key={nb.node.id}>
                <button type="button" style={s.nbBtn} onClick={() => onSelect(nb.node.id)} title={nb.node.path}>
                  <NbIcon size={12} style={{ color: meta.color, flexShrink: 0 }} aria-hidden />
                  <span style={s.nbMain}>
                    <span className="mono" style={s.nbName}>
                      {display(nb.node)}
                    </span>
                    <span style={s.nbPath}>
                      {nb.node.path}
                      {nb.line != null ? `:${nb.line}` : ""}
                    </span>
                  </span>
                  <span style={s.nbKinds}>
                    {nb.kinds.map((k) => (
                      <span key={k} style={s.kindTag}>
                        {t(`edge.${k as BlastGraphEdge["kind"]}`)}
                      </span>
                    ))}
                    {nb.inferred && <span style={s.kindTagMuted}>{t("detail.inferred")}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > LIST_PREVIEW && (
        <button type="button" style={s.moreBtn} onClick={() => setAll((v) => !v)}>
          {all ? t("detail.showLess") : t("detail.showAll", { count: items.length })}
        </button>
      )}
    </section>
  );
}
