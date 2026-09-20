/* OutdatedComments — footer list for comments GitHub can no longer place on the
   current diff (the anchored line is gone). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { type CommentThread, cs } from "../comments";
import { CommentCard } from "../CommentCard";

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
