/* CommitRow — a PR commit marker in the timeline (sha · subject · author · time). */
"use client";

import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { SHORT_SHA_LENGTH } from "../../constants";
import { s } from "../../styles";

export function CommitRow({ commit }: { commit: PrCommit }) {
  return (
    <div style={s.commitRow}>
      <Icon.GitCommit size={15} style={s.commitIcon} />
      <span className="mono" style={s.commitSha}>
        {commit.sha.slice(0, SHORT_SHA_LENGTH)}
      </span>
      <span style={s.commitMessage} title={commit.message}>
        {commit.message.split("\n")[0]}
      </span>
      <span style={s.commitMeta}>{commit.author}</span>
      {commit.committed_at && (
        <span style={s.commitMeta}>{new Date(commit.committed_at).toLocaleTimeString()}</span>
      )}
    </div>
  );
}
