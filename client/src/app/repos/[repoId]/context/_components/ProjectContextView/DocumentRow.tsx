"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ProjectDocument } from "@devdigest/shared";
import { docTypeColor } from "./constants";
import { s } from "./styles";

/** One discovered document row — path, doc-type chip, real token count
 *  (AC-6), and the direct-attachment "used by N agents" count (AC-22/D8).
 *  Clicking selects it for the read-only preview pane (AC-4); there is no
 *  other affordance on this row (AC-35). */
export function DocumentRow({
  doc,
  active,
  onSelect,
}: {
  doc: ProjectDocument;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("context");
  const type = docTypeColor(doc.doc_type);
  return (
    <button type="button" style={s.row(active)} onClick={onSelect} aria-pressed={active}>
      <div style={s.rowTop}>
        <span className="mono" style={s.rowPath}>
          {doc.path}
        </span>
        <Badge color={type.color} bg={type.bg}>
          {doc.doc_type}
        </Badge>
      </div>
      <div style={s.rowMeta}>
        <span className="tnum">{t("list.tokens", { count: doc.tokens })}</span>
        <span>{t("list.usedBy", { count: doc.used_by })}</span>
      </div>
    </button>
  );
}
