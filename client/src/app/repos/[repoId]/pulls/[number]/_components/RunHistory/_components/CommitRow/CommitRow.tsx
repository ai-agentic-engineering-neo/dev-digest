"use client";

import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { s } from "./styles";

/** One commit marker in the PR timeline. */
export function CommitRow({ commit }: { commit: PrCommit }) {
  return (
    <div style={s.row}>
      <Icon.GitCommit size={15} style={s.icon} />
      <span className="mono" style={s.sha}>
        {commit.sha.slice(0, 7)}
      </span>
      <span style={s.message} title={commit.message}>
        {commit.message.split("\n")[0]}
      </span>
      <span style={s.author}>{commit.author}</span>
      {commit.committed_at && (
        <span style={s.time}>{new Date(commit.committed_at).toLocaleTimeString()}</span>
      )}
    </div>
  );
}
