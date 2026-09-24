/* BodyEditor — the skill body editor: a file header (<name>.md, an `unsaved`
   badge while dirty, ~N tokens) over CodeMirror. CodeMirror is code-split with
   next/dynamic (ssr:false); a skeleton shows while it loads. */
"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Badge, Icon, Skeleton } from "@devdigest/ui";
import { estimateTokens } from "@/app/skills/helpers";
import { s } from "./styles";

const CodeMirrorField = dynamic(() => import("./CodeMirrorField"), {
  ssr: false,
  loading: () => <Skeleton height={320} />,
});

export function BodyEditor({
  name,
  value,
  onChange,
  dirty,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  dirty: boolean;
}) {
  const t = useTranslations("skills");
  return (
    <div style={s.frame}>
      <div style={s.header}>
        <Icon.FileText size={13} style={s.fileIcon} />
        <span className="mono" style={s.fileName}>
          {name || "…"}.md
        </span>
        {dirty && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("config.unsaved")}
          </Badge>
        )}
        <span className="mono tnum" style={s.tokens}>
          {t("config.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <CodeMirrorField value={value} onChange={onChange} label={t("fields.body")} />
    </div>
  );
}
