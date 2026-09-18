import type {
  CodeHostClient,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
  PrFile,
  PrCommit,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';

const TIMEOUT = 30_000;
const API_BASE = 'https://gitlab.com/api/v4';

/** GitLab MR "diff refs" — required to anchor an inline discussion note to a diff. */
interface DiffRefs {
  base_sha: string;
  start_sha: string;
  head_sha: string;
}

interface GitLabError extends Error {
  status: number;
}

function mapStatus(state: string): PrStatus {
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  return 'open'; // 'opened' | 'locked'
}

/** Count added/removed lines in a unified diff hunk, excluding the +++/--- file headers. */
function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions++;
    else if (line.startsWith('-')) deletions++;
  }
  return { additions, deletions };
}

/**
 * CodeHostClient over the GitLab REST API v4 — thin. PAT auth via the
 * `PRIVATE-TOKEN` header (never a query-string token, so it can't leak into
 * access logs). gitlab.com only; self-managed instances are out of scope.
 */
export class GitLabClient implements CodeHostClient {
  constructor(private token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers: {
              'PRIVATE-TOKEN': this.token,
              ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
              ...init?.headers,
            },
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            const err = new Error(
              `GitLab API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`,
            ) as GitLabError;
            err.status = res.status;
            throw err;
          }
          if (res.status === 204) return undefined as T;
          return (await res.json()) as T;
        })(),
        TIMEOUT,
      ),
    );
  }

  /** `owner/name` → the URL-encoded project path GitLab accepts as `:id`. */
  private projectId(repo: RepoRef): string {
    return encodeURIComponent(`${repo.owner}/${repo.name}`);
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    const mrs = await this.request<
      {
        iid: number;
        title: string;
        author: { username: string } | null;
        source_branch: string;
        target_branch: string;
        sha: string | null;
        state: string;
        created_at: string;
        updated_at: string;
      }[]
    >(`/projects/${this.projectId(repo)}/merge_requests?state=all&order_by=updated_at&sort=desc&per_page=50`);
    return mrs.map((mr) => ({
      number: mr.iid,
      title: mr.title,
      author: mr.author?.username ?? 'unknown',
      branch: mr.source_branch,
      base: mr.target_branch,
      head_sha: mr.sha ?? '',
      additions: 0,
      deletions: 0,
      files_count: 0, // not on the list payload; populated by getPullRequest
      status: mapStatus(mr.state),
      opened_at: mr.created_at,
      updated_at: mr.updated_at,
    }));
  }

  /** MR detail including `diff_refs`, needed to anchor inline discussion notes. */
  private async getMrDetail(repo: RepoRef, n: number) {
    return this.request<{
      iid: number;
      title: string;
      author: { username: string } | null;
      source_branch: string;
      target_branch: string;
      sha: string | null;
      state: string;
      created_at: string;
      updated_at: string;
      description: string | null;
      diff_refs: DiffRefs | null;
      changes_count: string | null;
    }>(`/projects/${this.projectId(repo)}/merge_requests/${n}`);
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    const [mr, diffs, commits] = await Promise.all([
      this.getMrDetail(repo, n),
      this.request<{ old_path: string; new_path: string; diff: string; deleted_file: boolean }[]>(
        `/projects/${this.projectId(repo)}/merge_requests/${n}/diffs?per_page=100`,
      ),
      this.request<{ id: string; message: string; author_name: string; authored_date: string }[]>(
        `/projects/${this.projectId(repo)}/merge_requests/${n}/commits?per_page=100`,
      ),
    ]);

    const files: PrFile[] = diffs.map((d) => {
      const { additions, deletions } = countDiffLines(d.diff);
      return { path: d.new_path || d.old_path, additions, deletions, patch: d.diff };
    });
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    const prCommits: PrCommit[] = commits.map((c) => ({
      sha: c.id,
      message: c.message,
      author: c.author_name,
      committed_at: c.authored_date,
    }));

    const linkedIssue = await this.resolveLinkedIssue(repo, mr.description ?? '');

    return {
      number: mr.iid,
      title: mr.title,
      author: mr.author?.username ?? 'unknown',
      branch: mr.source_branch,
      base: mr.target_branch,
      head_sha: mr.sha ?? '',
      additions: totalAdditions,
      deletions: totalDeletions,
      files_count: files.length,
      status: mapStatus(mr.state),
      opened_at: mr.created_at,
      updated_at: mr.updated_at,
      body: mr.description,
      files,
      commits: prCommits,
      linked_issue: linkedIssue,
    };
  }

  /** linked issue via regex on the MR description (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  /**
   * GitLab has no REQUEST_CHANGES review event (approvals are approve/
   * unapprove only). Mapping (confirmed with the product owner):
   *   APPROVE         → POST .../approve, plus a note if `body` is set.
   *   REQUEST_CHANGES → POST .../unapprove (no-op if not previously
   *                     approved — a 404 here is swallowed), plus a note
   *                     prefixed "Changes requested: ".
   *   COMMENT         → a plain note only.
   * Any `review.comments` are posted as inline diff-anchored discussions.
   */
  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    if (review.event === 'APPROVE') {
      await this.request(`/projects/${this.projectId(repo)}/merge_requests/${n}/approve`, {
        method: 'POST',
      });
    } else if (review.event === 'REQUEST_CHANGES') {
      try {
        await this.request(`/projects/${this.projectId(repo)}/merge_requests/${n}/unapprove`, {
          method: 'POST',
        });
      } catch (err) {
        if ((err as GitLabError).status !== 404) throw err;
      }
    }

    let noteId: number | undefined;
    const body =
      review.event === 'REQUEST_CHANGES' && review.body
        ? `Changes requested: ${review.body}`
        : review.body;
    if (body) {
      const note = await this.request<{ id: number }>(
        `/projects/${this.projectId(repo)}/merge_requests/${n}/notes`,
        { method: 'POST', body: JSON.stringify({ body }) },
      );
      noteId = note.id;
    }

    for (const comment of review.comments ?? []) {
      await this.postInlineNote(repo, n, {
        commitId: '',
        path: comment.path,
        line: comment.line,
        body: comment.body,
      });
    }

    return { id: noteId != null ? String(noteId) : `gitlab-${review.event.toLowerCase()}-${n}` };
  }

  /** Shape a GitLab discussion note into our DTO. `discussionId` threads replies. */
  private mapNote(
    note: {
      id: number;
      body: string;
      author: { username: string } | null;
      created_at: string;
      resolvable: boolean;
      position?: {
        new_path: string;
        old_path: string;
        new_line: number | null;
        old_line: number | null;
      } | null;
    },
    discussionId: string,
    webUrl: string,
  ): PrReviewComment {
    const pos = note.position;
    return {
      id: note.id,
      path: pos?.new_path ?? pos?.old_path ?? '',
      line: pos?.new_line ?? null,
      original_line: pos?.old_line ?? pos?.new_line ?? null,
      side: pos?.new_line != null ? 'RIGHT' : 'LEFT',
      body: note.body,
      user: note.author?.username ?? 'unknown',
      created_at: note.created_at,
      html_url: `${webUrl}#note_${note.id}`,
      // GitLab replies thread via discussion_id, not the parent note's numeric
      // id; we still surface it here (parsed back out of `in_reply_to` below)
      // since the shared DTO only has room for one numeric "reply target".
      in_reply_to_id: discussionId ? Number(discussionId) || null : null,
      is_outdated: !note.position,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    const discussions = await this.request<
      {
        id: string;
        notes: {
          id: number;
          body: string;
          author: { username: string } | null;
          created_at: string;
          resolvable: boolean;
          position?: {
            new_path: string;
            old_path: string;
            new_line: number | null;
            old_line: number | null;
          } | null;
        }[];
      }[]
    >(`/projects/${this.projectId(repo)}/merge_requests/${n}/discussions?per_page=100`);

    const webUrl = `https://gitlab.com/${repo.owner}/${repo.name}/-/merge_requests/${n}`;
    const out: PrReviewComment[] = [];
    for (const d of discussions) {
      // Only inline (diff-anchored) notes belong on the "Files changed" tab.
      const inline = d.notes.filter((note) => note.position);
      for (const note of inline) out.push(this.mapNote(note, d.id, webUrl));
    }
    return out;
  }

  /** Fetch diff_refs for the MR, required to anchor a new inline discussion note. */
  private async postInlineNote(
    repo: RepoRef,
    n: number,
    input: { commitId: string; path: string; line: number; side?: 'LEFT' | 'RIGHT'; body: string },
  ): Promise<PrReviewComment> {
    const mr = await this.getMrDetail(repo, n);
    if (!mr.diff_refs) {
      throw new Error(`GitLab MR !${n} has no diff_refs — cannot anchor an inline comment`);
    }
    const onOldSide = input.side === 'LEFT';
    const discussion = await this.request<{
      id: string;
      notes: {
        id: number;
        body: string;
        author: { username: string } | null;
        created_at: string;
        resolvable: boolean;
        position?: {
          new_path: string;
          old_path: string;
          new_line: number | null;
          old_line: number | null;
        } | null;
      }[];
    }>(`/projects/${this.projectId(repo)}/merge_requests/${n}/discussions`, {
      method: 'POST',
      body: JSON.stringify({
        body: input.body,
        position: {
          position_type: 'text',
          base_sha: mr.diff_refs.base_sha,
          start_sha: mr.diff_refs.start_sha,
          head_sha: mr.diff_refs.head_sha,
          new_path: input.path,
          old_path: input.path,
          ...(onOldSide ? { old_line: input.line } : { new_line: input.line }),
        },
      }),
    });
    const webUrl = `https://gitlab.com/${repo.owner}/${repo.name}/-/merge_requests/${n}`;
    return this.mapNote(discussion.notes[0]!, discussion.id, webUrl);
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    if (input.inReplyTo != null) {
      // GitLab threads replies via a discussion id (a hash-like string), not
      // an individual note's numeric id — `in_reply_to` carries whichever
      // discussion id `listReviewComments` surfaced for the parent note.
      const discussionId = String(input.inReplyTo);
      const note = await this.request<{
        id: number;
        body: string;
        author: { username: string } | null;
        created_at: string;
        resolvable: boolean;
        position?: {
          new_path: string;
          old_path: string;
          new_line: number | null;
          old_line: number | null;
        } | null;
      }>(
        `/projects/${this.projectId(repo)}/merge_requests/${n}/discussions/${discussionId}/notes`,
        { method: 'POST', body: JSON.stringify({ body: input.body }) },
      );
      const webUrl = `https://gitlab.com/${repo.owner}/${repo.name}/-/merge_requests/${n}`;
      return this.mapNote(note, discussionId, webUrl);
    }
    return this.postInlineNote(repo, n, {
      commitId: input.commitId,
      path: input.path,
      line: input.line,
      side: input.side,
      body: input.body,
    });
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    const mr = await this.request<{ iid: number; web_url: string }>(
      `/projects/${this.projectId(repo)}/merge_requests`,
      {
        method: 'POST',
        body: JSON.stringify({
          source_branch: payload.head,
          target_branch: payload.base,
          title: payload.title,
          description: payload.body,
        }),
      },
    );
    return { url: mr.web_url };
  }

  async commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    const projectId = this.projectId(repo);
    let branchExists = true;
    try {
      await this.request(`/projects/${projectId}/repository/branches/${encodeURIComponent(payload.branch)}`);
    } catch (err) {
      if ((err as GitLabError).status !== 404) throw err;
      branchExists = false;
    }
    if (!branchExists) {
      await this.request(`/projects/${projectId}/repository/branches`, {
        method: 'POST',
        body: JSON.stringify({ branch: payload.branch, ref: payload.base }),
      });
    }
    await this.request(`/projects/${projectId}/repository/commits`, {
      method: 'POST',
      body: JSON.stringify({
        branch: payload.branch,
        commit_message: payload.message,
        actions: payload.files.map((f) => ({
          action: 'create', // GitLab treats create-on-existing-path as an error;
          file_path: f.path, // acceptable for the MVP's "publish generated files" use case.
          content: f.contents,
        })),
      }),
    });
    return { branch: payload.branch };
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    const mrs = await this.request<{ web_url: string }[]>(
      `/projects/${this.projectId(repo)}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}&per_page=1`,
    );
    return mrs[0] ? { url: mrs[0].web_url } : null;
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const issue = await this.request<{
      iid: number;
      title: string;
      description: string | null;
      state: string;
    }>(`/projects/${this.projectId(repo)}/issues/${n}`);
    return { number: issue.iid, title: issue.title, body: issue.description, state: issue.state };
  }

  async currentLogin(): Promise<string> {
    const user = await this.request<{ username: string }>('/user');
    return user.username;
  }
}
