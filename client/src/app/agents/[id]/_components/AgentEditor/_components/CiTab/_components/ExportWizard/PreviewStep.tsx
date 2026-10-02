"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, Badge } from "@devdigest/ui";
import type { CiFile, CiExportInputBody } from "@devdigest/shared/contracts/eval-ci";
import { useCiPreviewFile } from "@/lib/hooks/ci";
import { s } from "./styles";

/**
 * AC-3 — the complete generated file set, each with path + full contents,
 * marking which are editable. D-P8 — the runner bundle (the one
 * `editable: false` file) renders collapsed behind its path + byte size;
 * every other file renders expanded. P-4 — a collapsed file's `contents` is
 * `null` (the runner bundle, nulled by the preview response); expanding it
 * fetches that one file's real bytes on demand via `useCiPreviewFile`,
 * never all of them eagerly.
 */
export function PreviewStep({
  agentId,
  input,
  files,
  isLoading,
}: {
  agentId: string;
  input: CiExportInputBody;
  files: CiFile[] | undefined;
  isLoading: boolean;
}) {
  const t = useTranslations("ci");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  if (isLoading || !files) {
    return (
      <div style={s.fileList}>
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }

  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>{t("exportWizard.filesToCreate")}</label>
      <div style={s.fileList}>
        {files.map((f) => {
          // D-P8 — the one non-editable file (the runner bundle) starts
          // collapsed; every other file starts expanded. Either can be
          // toggled by clicking its header.
          const isCollapsedByDefault = !f.editable;
          const toggled = expanded.has(f.path);
          const show = isCollapsedByDefault ? toggled : !toggled;
          return (
            <div key={f.path} style={s.fileCard}>
              <button
                type="button"
                style={{ ...s.fileHead, width: "100%", border: "none", cursor: "pointer" }}
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(f.path)) next.delete(f.path);
                    else next.add(f.path);
                    return next;
                  })
                }
              >
                <span style={{ flex: 1, textAlign: "left" }}>{f.path}</span>
                {isCollapsedByDefault && <span style={s.hint}>{formatBytes(f.bytes)}</span>}
                {f.editable && <Badge>{t("exportWizard.editable")}</Badge>}
              </button>
              {show &&
                // P-4 — the runner bundle's own files carry `contents: null`
                // in a preview response (never inlined); every other file's
                // contents is always a string. A null-content file fetches
                // its own bytes on demand, only while actually expanded.
                (f.contents != null ? (
                  <pre style={s.filePre}>{f.contents}</pre>
                ) : (
                  <RunnerFileContent agentId={agentId} input={input} path={f.path} />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** P-4 — mounted only while its file's card is expanded (unmounting drops
 *  the query, so re-collapsing then re-expanding just re-fetches — react
 *  query's cache on `staleTime: Infinity` makes that a no-op round trip for
 *  an unchanged agent/input, never a fresh generation). */
function RunnerFileContent({
  agentId,
  input,
  path,
}: {
  agentId: string;
  input: CiExportInputBody;
  path: string;
}) {
  const t = useTranslations("ci");
  const { data, isLoading, isError } = useCiPreviewFile(agentId, input, path, true);
  if (isLoading) return <Skeleton height={48} />;
  if (isError || !data) return <p style={s.hint}>{t("exportWizard.contentsUnavailable")}</p>;
  return <pre style={s.filePre}>{data.contents}</pre>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
