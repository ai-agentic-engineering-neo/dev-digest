"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { parseRootsInput, rootsToInput } from "./helpers";
import { s } from "./styles";

/**
 * Compact search-roots control (Q1/Q2, US-8/AC-29) — the minimum surface that
 * satisfies "let a user change where this repo's docs are searched": one
 * textarea, one root per line, saved as `PUT /repos/:id/context/config`.
 * Validation (relative, `..`-free, non-absolute — AC-27) is enforced
 * server-side; this control does not attempt to re-implement it.
 */
export function RootsEditor({
  roots,
  saving,
  onCancel,
  onSave,
}: {
  roots: string[];
  saving: boolean;
  onCancel: () => void;
  onSave: (roots: string[]) => void;
}) {
  const t = useTranslations("context");
  const [value, setValue] = React.useState(() => rootsToInput(roots));

  return (
    <div style={s.rootsPanel}>
      <p style={s.rootsHint}>{t("roots.hint")}</p>
      <textarea
        style={s.rootsTextarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("roots.placeholder")}
        aria-label={t("roots.label")}
      />
      <div style={s.rootsActions}>
        <Button kind="ghost" size="sm" onClick={onCancel}>
          {t("roots.cancel")}
        </Button>
        <Button
          kind="primary"
          size="sm"
          loading={saving}
          onClick={() => onSave(parseRootsInput(value))}
        >
          {t("roots.save")}
        </Button>
      </div>
    </div>
  );
}
