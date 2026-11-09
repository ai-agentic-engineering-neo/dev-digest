"use client";

import { useRef, useState } from "react";
import { useUploadDevdigestDoc } from "@/lib/hooks/devdigest-docs";
import { devdigestErrorOf, fileToBase64, precheckUpload } from "@/lib/devdigest-docs";
import type { DevdigestDocErrorReason, DevdigestNameRule } from "@/lib/types";

export interface UploadReportState {
  added: string[];
  rejected: { name: string; reason?: DevdigestDocErrorReason; rule?: DevdigestNameRule; message?: string }[];
  conflicts: string[];
}

const EMPTY_REPORT: UploadReportState = { added: [], rejected: [], conflicts: [] };

/**
 * Sequential upload of .md files into `folder`; 409 conflicts wait for Overwrite / Cancel. A conflict
 * remembers the folder it happened in: the user may pick another folder before resolving it, and
 * Overwrite must replace the conflicting doc, not upload into the newly selected folder.
 */
export function useUploadQueue(repoId: string, folder: string) {
  const upload = useUploadDevdigestDoc(repoId);
  const [report, setReport] = useState<UploadReportState>(EMPTY_REPORT);
  const pending = useRef(new Map<string, { file: File; folder: string }>());
  // Batch id: a new start (or dismiss) supersedes the running batch. A superseded batch stops before
  // its next file and never writes into the current report or the current pending conflicts.
  const batch = useRef(0);

  async function send(file: File, overwrite: boolean, into: string, id: number): Promise<void> {
    try {
      const content_base64 = await fileToBase64(file);
      const doc = await upload.mutateAsync({ folder: into, filename: file.name, content_base64, overwrite });
      if (id !== batch.current) return;
      setReport((r) => ({ ...r, added: [...r.added, doc.path] }));
    } catch (e) {
      if (id !== batch.current) return;
      const details = devdigestErrorOf(e);
      if (details?.reason === "exists" && !overwrite) {
        pending.current.set(file.name, { file, folder: into });
        setReport((r) => ({ ...r, conflicts: [...r.conflicts, file.name] }));
        return;
      }
      setReport((r) => ({
        ...r,
        rejected: [
          ...r.rejected,
          details
            ? { name: file.name, reason: details.reason, rule: details.rule }
            : { name: file.name, message: e instanceof Error ? e.message : String(e) },
        ],
      }));
    }
  }

  async function run(files: File[], into: string, id: number): Promise<void> {
    for (const file of files) {
      if (id !== batch.current) return;
      const rejection = precheckUpload(file);
      if (rejection) {
        setReport((r) => ({ ...r, rejected: [...r.rejected, { name: file.name, reason: rejection }] }));
        continue;
      }
      await send(file, false, into, id);
    }
  }

  function start(files: File[]): void {
    const id = ++batch.current;
    pending.current.clear();
    setReport(EMPTY_REPORT);
    void run(files, folder, id);
  }

  function resolveConflict(name: string, overwrite: boolean): void {
    const entry = pending.current.get(name);
    pending.current.delete(name);
    setReport((r) => ({ ...r, conflicts: r.conflicts.filter((n) => n !== name) }));
    if (entry && overwrite) void send(entry.file, true, entry.folder, batch.current);
  }

  function dismiss(): void {
    batch.current += 1;
    pending.current.clear();
    setReport(EMPTY_REPORT);
  }

  return { start, report, resolveConflict, dismiss };
}
