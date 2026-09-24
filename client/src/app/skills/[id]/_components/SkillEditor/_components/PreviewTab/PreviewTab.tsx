/* PreviewTab — the (unsaved) draft as the reviewing agent receives it: the
   exact block header (### name + Applies when:) over the rendered body. */
"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { skillBlockHeader } from "@/app/skills/helpers";
import { s } from "./styles";

export function PreviewTab({ name, description, body }: { name: string; description: string; body: string }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <p style={s.caption}>{t("preview.caption")}</p>
      <div style={s.block}>
        <pre className="mono" style={s.header}>
          {skillBlockHeader(name, description)}
        </pre>
        <div style={s.body}>
          <Markdown>{body}</Markdown>
        </div>
      </div>
    </div>
  );
}
