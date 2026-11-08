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

/** Sequential upload of .md files into `folder`; 409 conflicts wait for Overwrite / Cancel. */
export function useUploadQueue(repoId: string, folder: string) {
  const upload = useUploadDevdigestDoc(repoId);
  const [report, setReport] = useState<UploadReportState>(EMPTY_REPORT);
  const pending = useRef(new Map<string, File>());

  async function send(file: File, overwrite: boolean): Promise<void> {
    try {
      const content_base64 = await fileToBase64(file);
      const doc = await upload.mutateAsync({ folder, filename: file.name, content_base64, overwrite });
      setReport((r) => ({ ...r, added: [...r.added, doc.path] }));
    } catch (e) {
      const details = devdigestErrorOf(e);
      if (details?.reason === "exists" && !overwrite) {
        pending.current.set(file.name, file);
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

  async function run(files: File[]): Promise<void> {
    for (const file of files) {
      const rejection = precheckUpload(file);
      if (rejection) {
        setReport((r) => ({ ...r, rejected: [...r.rejected, { name: file.name, reason: rejection }] }));
        continue;
      }
      await send(file, false);
    }
  }

  function start(files: File[]): void {
    pending.current.clear();
    setReport(EMPTY_REPORT);
    void run(files);
  }

  function resolveConflict(name: string, overwrite: boolean): void {
    const file = pending.current.get(name);
    pending.current.delete(name);
    setReport((r) => ({ ...r, conflicts: r.conflicts.filter((n) => n !== name) }));
    if (file && overwrite) void send(file, true);
  }

  function dismiss(): void {
    pending.current.clear();
    setReport(EMPTY_REPORT);
  }

  return { start, report, resolveConflict, dismiss };
}
