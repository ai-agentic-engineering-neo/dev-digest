/* CommentCard — one review comment rendered as a Card with avatar + markdown
   body. Used by CommentThreadView and OutdatedComments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Card, Avatar, Markdown } from "@devdigest/ui";
import type { PrReviewComment, RepoProvider } from "@/lib/types";
import { platformLabel } from "@/lib/repo-urls";
import { cs } from "../comments";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function CommentCard({ c, provider }: { c: PrReviewComment; provider: RepoProvider }) {
  const t = useTranslations("shell");
  return (
    <Card>
      <div style={cs.headRow}>
        <Avatar name={c.user} size={20} />
        <span style={cs.user}>{c.user}</span>
        <span style={cs.time}>{formatWhen(c.created_at)}</span>
        <span style={{ flex: 1 }} />
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" style={cs.ghLink}>
          <Icon.ExternalLink size={12} />
          {t("diffViewer.viewOnPlatform", { platform: platformLabel(provider) })}
        </a>
      </div>
      <div style={cs.mdBody}>
        <Markdown>{c.body}</Markdown>
      </div>
    </Card>
  );
}
