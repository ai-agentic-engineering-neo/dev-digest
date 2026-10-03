/* ContextDocsPicker — the Context tab body shared by the agent editor
   ("Project context") and the skill editor ("Project context to use").
   Lists the active repo's discovered documents; checking a row attaches its
   path, attached rows reorder by drag handle or the arrow buttons (keyboard
   fallback), Preview opens the document drawer. Agents also show documents
   inherited from linked skills as checked, read-only rows. Stores paths only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import type { InheritedContextPath } from "@devdigest/shared";
import { useContextDocuments } from "@/lib/hooks/context";
import { ApiError } from "@/lib/api";
import { formatCostUsd, formatTokenCount } from "@/lib/format";
import { DocTypeBadge } from "./DocTypeBadge";
import { DocPreviewDrawer } from "./DocPreviewDrawer";
import { LARGE_CONTEXT_TOKENS } from "./constants";
import { dropPath, effectivePaths, movePath, pathsSkippedByBudget, type PickerRow } from "./helpers";
import { s } from "./styles";

export interface ContextDocsPickerProps {
  mode: "agent" | "skill";
  repoId: string | null;
  repoName: string;
  /** Directly attached paths, in order. */
  own: string[];
  /** Agent only — documents inherited from linked + enabled skills. */
  inherited?: InheritedContextPath[];
  onChange: (paths: string[]) => void;
  /** Agent only — the model's prompt price (USD / 1M tokens), when known. */
  promptPricePerM?: number | null;
}

export function ContextDocsPicker({
  mode,
  repoId,
  repoName,
  own,
  inherited = [],
  onChange,
  promptPricePerM,
}: ContextDocsPickerProps) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error, refetch } = useContextDocuments(repoId);
  const [filter, setFilter] = React.useState("");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragged, setDragged] = React.useState<string | null>(null);
  const [dropAt, setDropAt] = React.useState<{ path: string; after: boolean } | null>(null);

  const docs = React.useMemo(() => new Map((data?.documents ?? []).map((d) => [d.path, d])), [data]);
  const inheritedBy = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const i of inherited) if (!m.has(i.path)) m.set(i.path, i.skill_name);
    return m;
  }, [inherited]);

  if (!repoId) return <div style={s.wrap}><div style={s.note}>{t("picker.noRepo")}</div></div>;
  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={200} />
        <div style={{ height: 12 }} />
        <Skeleton height={260} />
      </div>
    );
  }
  if (isError) {
    const notCloned = error instanceof ApiError && error.code === "repo_not_cloned";
    return (
      <div style={s.wrap}>
        {notCloned ? (
          <ErrorState title={t("notCloned.title")} body={t("notCloned.body", { repo: repoName })} />
        ) : (
          <ErrorState title={t("loadError")} body={(error as Error)?.message} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const effective = mode === "agent" ? effectivePaths(own, inherited) : own;
  const tokensOf = (p: string) => docs.get(p)?.tokens ?? null;
  const totalTokens = effective.reduce((sum, p) => sum + (tokensOf(p) ?? 0), 0);
  const budget = data?.budget_tokens ?? 24_000;
  const skipped = pathsSkippedByBudget(effective, tokensOf, budget);

  // Row order: own (saved order) → inherited → everything else (path order).
  const rows: PickerRow[] = [];
  const placed = new Set<string>();
  for (const p of own) {
    rows.push({ path: p, doc: docs.get(p) ?? null, own: true, inheritedFrom: null });
    placed.add(p);
  }
  if (mode === "agent") {
    for (const [p, skill] of inheritedBy) {
      if (placed.has(p)) continue;
      rows.push({ path: p, doc: docs.get(p) ?? null, own: false, inheritedFrom: skill });
      placed.add(p);
    }
  }
  for (const d of data?.documents ?? []) {
    if (!placed.has(d.path)) rows.push({ path: d.path, doc: d, own: false, inheritedFrom: null });
  }

  const q = filter.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;
  const total = data?.documents.length ?? 0;

  const toggle = (path: string) =>
    onChange(own.includes(path) ? own.filter((p) => p !== path) : [...own, path]);

  const previewRow = preview ? rows.find((r) => r.path === preview) : undefined;
  const cost =
    promptPricePerM != null ? formatCostUsd((totalTokens / 1_000_000) * promptPricePerM) : null;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{mode === "agent" ? t("picker.agentTitle") : t("picker.skillTitle")}</h2>
        <span style={s.count}>
          {mode === "agent"
            ? t("picker.attachedCount", { attached: effective.length, total })
            : t("picker.skillAttachedCount", { attached: own.length })}
        </span>
        <div style={s.filter}>
          <TextInput
            value={filter}
            onChange={setFilter}
            placeholder={t("filterPlaceholder")}
            aria-label={t("filterPlaceholder")}
          />
        </div>
      </div>
      <div style={s.hint}>
        {mode === "agent" ? (
          <>
            {t("picker.agentHint").split("## Project context")[0]}
            <code className="mono" style={s.inlineCode}>## Project context</code>
            {t("picker.agentHint").split("## Project context")[1]}
          </>
        ) : (
          t("picker.skillHint")
        )}
      </div>

      {mode === "agent" && totalTokens > budget ? (
        <div role="status" style={s.warn}>
          <Icon.AlertTriangle size={14} /> {t("picker.overBudget", { budget: formatTokenCount(budget) })}
        </div>
      ) : mode === "agent" && totalTokens > LARGE_CONTEXT_TOKENS ? (
        <div role="status" style={s.warn}>
          <Icon.AlertTriangle size={14} />{" "}
          {t("picker.warnLarge", {
            tokens: formatTokenCount(totalTokens),
            cost: cost ? t("picker.warnCost", { cost }) : "",
          })}
        </div>
      ) : null}

      {data?.truncated && <div style={s.note}>{t("truncated", { count: total })}</div>}

      {shown.length === 0 ? (
        <div style={s.note}>
          {q ? t("noMatches", { q: filter.trim() }) : t("empty.body", { roots: data!.roots.join(", "), glob: data!.glob })}
        </div>
      ) : (
        <div style={s.list}>
          {shown.map((r) => {
            const checked = r.own || r.inheritedFrom != null;
            const ownIdx = own.indexOf(r.path);
            const isDrop = dropAt?.path === r.path && r.own;
            return (
              <div
                key={r.path}
                style={s.row(checked, dragged === r.path, isDrop ? (dropAt!.after ? "after" : "before") : null)}
                onDragOver={(e) => {
                  if (!dragged || !r.own) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > rect.top + rect.height / 2;
                  setDropAt((prev) => (prev?.path === r.path && prev.after === after ? prev : { path: r.path, after }));
                }}
                onDrop={(e) => {
                  if (!dragged || !r.own) return;
                  e.preventDefault();
                  if (dropAt) onChange(dropPath(own, dragged, dropAt.path, dropAt.after));
                  setDragged(null);
                  setDropAt(null);
                }}
              >
                <span
                  style={s.grip(r.own)}
                  draggable={r.own}
                  aria-label={t("picker.dragAria", { path: r.path })}
                  onDragStart={(e) => {
                    setDragged(r.path);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", r.path);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setDropAt(null);
                  }}
                >
                  <Icon.GripVertical size={14} />
                </span>
                <span aria-label={t("picker.attachAria", { path: r.path })} style={{ display: "inline-flex", opacity: r.inheritedFrom ? 0.55 : 1 }}>
                  <Checkbox checked={checked} onChange={r.inheritedFrom ? undefined : () => toggle(r.path)} />
                </span>
                <span className="mono" style={s.name} title={r.path}>
                  {r.doc?.name ?? r.path.split("/").pop()}
                </span>
                <span className="mono" style={s.dir} title={r.path}>
                  {r.doc?.dir ?? r.path.slice(0, r.path.lastIndexOf("/") + 1)}
                </span>
                {r.inheritedFrom && <span style={s.tag}>{t("picker.inheritedFrom", { skill: r.inheritedFrom })}</span>}
                {!r.doc && <span style={s.missing}>{t("picker.notFound", { repo: repoName })}</span>}
                {skipped.has(r.path) && <span style={s.missing}>{t("picker.willSkip")}</span>}
                <span style={{ flex: 1 }} />
                {r.own && (
                  <span style={s.moveBtns}>
                    <button
                      type="button"
                      style={s.moveBtn(ownIdx === 0)}
                      disabled={ownIdx === 0}
                      onClick={() => onChange(movePath(own, r.path, -1))}
                      aria-label={t("picker.moveUp", { path: r.path })}
                    >
                      <Icon.ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      style={s.moveBtn(ownIdx === own.length - 1)}
                      disabled={ownIdx === own.length - 1}
                      onClick={() => onChange(movePath(own, r.path, 1))}
                      aria-label={t("picker.moveDown", { path: r.path })}
                    >
                      <Icon.ArrowDown size={13} />
                    </button>
                  </span>
                )}
                {r.doc ? (
                  <DocTypeBadge type={r.doc.type} />
                ) : r.own ? (
                  <button type="button" style={s.previewBtn} onClick={() => toggle(r.path)}>
                    {t("picker.remove")}
                  </button>
                ) : null}
                {r.doc && (
                  <button
                    type="button"
                    style={s.previewBtn}
                    onClick={() => setPreview(r.path)}
                    aria-label={t("picker.previewAria", { path: r.path })}
                  >
                    <Icon.Eye size={13} />
                    {mode === "agent" && <span>{t("picker.preview")}</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mode === "agent" ? (
        <div style={s.footer}>
          <span className="mono" style={s.tokens}>
            {t("approxTokens", { tokens: formatTokenCount(totalTokens) })}
          </span>
          <span style={s.footerNote}>{t("picker.untrustedNote")}</span>
        </div>
      ) : (
        <>
          <div style={s.serialLabel}>{t("picker.serializesAs")}</div>
          <pre className="mono" style={s.serialBox}>
            {["## Project context", ...(own.length > 0 ? own.map((p) => `- ${p}`) : [])].join("\n")}
          </pre>
          <div style={s.footerLeft}>
            <span className="mono" style={s.tokens}>
              {t("approxTokens", { tokens: formatTokenCount(totalTokens) })}
            </span>
          </div>
        </>
      )}

      {preview && repoId && (
        <DocPreviewDrawer
          repoId={repoId}
          path={preview}
          attached={own.includes(preview)}
          inheritedFrom={previewRow && !previewRow.own ? previewRow.inheritedFrom : null}
          onToggle={() => toggle(preview)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

