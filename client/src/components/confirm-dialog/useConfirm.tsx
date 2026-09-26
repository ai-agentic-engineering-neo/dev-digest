"use client";

import React from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
}

/** Imperative-feeling confirm on top of a controlled dialog:
   `confirm(opts, onConfirm)` opens it; render `dialog` once in the component's
   JSX (it is `null` while closed). `onConfirm` runs only if the user confirms. */
export function useConfirm() {
  const [pending, setPending] = React.useState<(ConfirmOptions & { onConfirm: () => void }) | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions, onConfirm: () => void) => setPending({ ...opts, onConfirm }),
    [],
  );

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      body={pending.body}
      confirmLabel={pending.confirmLabel}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        setPending(null);
        pending.onConfirm();
      }}
    />
  ) : null;

  return { confirm, dialog };
}
