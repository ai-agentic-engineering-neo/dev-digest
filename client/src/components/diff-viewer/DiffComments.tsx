/* React bits for inline diff comments: a comment thread (cards + reply) and the
   inline composer. Reuses the @devdigest/ui design system (Card, Avatar,
   Markdown, Textarea, Button) so it matches the rest of the app. Pure
   helpers/types/styles live in comments.ts. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Card, Avatar, Markdown, Textarea, Button } from "@devdigest/ui";
import type { PrReviewComment } from "../../lib/types";
import { cs, type CommentThread, type DiffCommentApi } from "./comments";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** One review comment, rendered as a Card with avatar + markdown body. */
function CommentCard({ c }: { c: PrReviewComment }) {
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
          {t("diffViewer.viewOnGitHub")}
        </a>
      </div>
      <div style={cs.mdBody}>
        <Markdown>{c.body}</Markdown>
      </div>
    </Card>
  );
}

/** Shared inline composer (new comment or reply to a thread). */
export function InlineComposer({
  commenting,
  path,
  line,
  side,
  inReplyTo,
  onClose,
}: {
  commenting: DiffCommentApi;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  inReplyTo?: number;
  onClose: () => void;
}) {
  const t = useTranslations("shell");
  const [text, setText] = React.useState("");
  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      await commenting.onSubmit({
        path,
        line,
        side,
        body,
        ...(inReplyTo != null ? { in_reply_to: inReplyTo } : {}),
      });
      setText("");
      onClose();
    } catch {
      /* error toast is raised by the caller; keep the draft open */
    }
  };
  return (
    <div
      style={cs.thread}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
      }}
    >
      <Textarea
        value={text}
        onChange={setText}
        rows={3}
        placeholder={t("diffViewer.commentPlaceholder")}
      />
      <div style={cs.composerActions}>
        <Button
          kind="primary"
          size="sm"
          icon="MessageSquare"
          loading={commenting.posting}
          disabled={commenting.posting || !text.trim()}
          onClick={() => void submit()}
        >
          {t("diffViewer.post")}
        </Button>
        <Button kind="ghost" size="sm" onClick={onClose} disabled={commenting.posting}>
          {t("diffViewer.cancel")}
        </Button>
        <span style={cs.hint}>{t("diffViewer.postedToGitHub")}</span>
      </div>
    </div>
  );
}

/** A single thread (root comment + replies) with an inline reply composer. */
export function CommentThreadView({
  thread,
  commenting,
  path,
}: {
  thread: CommentThread;
  commenting: DiffCommentApi;
  path: string;
}) {
  const t = useTranslations("shell");
  const [replying, setReplying] = React.useState(false);
  return (
    <div style={cs.thread}>
      {thread.comments.map((c) => (
        <CommentCard key={c.id} c={c} />
      ))}
      {commenting.canComment &&
        (replying ? (
          <InlineComposer
            commenting={commenting}
            path={path}
            line={thread.line!}
            side={thread.side}
            inReplyTo={thread.rootId}
            onClose={() => setReplying(false)}
          />
        ) : (
          <div>
            <Button
              kind="ghost"
              size="sm"
              icon="CornerDownRight"
              onClick={() => setReplying(true)}
            >
              {t("diffViewer.reply")}
            </Button>
          </div>
        ))}
    </div>
  );
}

/** Footer list for comments GitHub can no longer place on the current diff. */
export function OutdatedComments({ threads }: { threads: CommentThread[] }) {
  const t = useTranslations("shell");
  if (threads.length === 0) return null;
  const count = threads.reduce((n, th) => n + th.comments.length, 0);
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("diffViewer.outdatedTitle", { count })}</span>
      {threads.flatMap((th) => th.comments.map((c) => <CommentCard key={c.id} c={c} />))}
    </div>
  );
}
