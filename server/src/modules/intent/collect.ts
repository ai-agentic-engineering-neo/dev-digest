import type { IntentSource, RepoRef } from '@devdigest/shared';
import { withTimeout } from '../../platform/resilience.js';
import {
  GIT_FETCH_TIMEOUT_MS,
  MAX_BODY_CHARS,
  MAX_COMMIT_SUBJECT_CHARS,
  MAX_COMMITS,
  MAX_DOC_CHARS,
  MAX_FILES_LISTED,
  MAX_ISSUE_CHARS,
  MAX_LABELS,
} from './constants.js';
import { isSubstantiveBody } from './confidence.js';
import { contentFromAddedFilePatch } from './helpers.js';
import { parseReferences } from './references.js';
import type {
  CollectedSources,
  IntentDeps,
  IntentPullCommit,
  IntentPullFile,
  IntentPullRecord,
} from './types.js';

function issueStatus(err: unknown): 'not_found' | 'unavailable' {
  const status =
    (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  return status === 404 ? 'not_found' : 'unavailable';
}

/**
 * Gathers everything the intent derivation may use, already capped and
 * classified into `IntentSource[]` — one entry per thing that was tried,
 * whether or not it resolved. Never throws: a failing GitHub or clone read
 * degrades the collection (`degraded: true`) rather than aborting it, because
 * "reviewing with a worse intent" beats "reviewing with none at all".
 */
export async function collectSources(
  deps: IntentDeps,
  input: { pull: IntentPullRecord; repo: RepoRef; files: IntentPullFile[]; commits: IntentPullCommit[] },
): Promise<CollectedSources> {
  const { pull, repo, files, commits } = input;
  const title = pull.title;
  const bodyRaw = (pull.body ?? '').slice(0, MAX_BODY_CHARS);
  const bodySubstantive = isSubstantiveBody(bodyRaw);

  const sources: IntentSource[] = [];
  let degraded = false;

  sources.push({ kind: 'pr_title', ref: 'title', status: 'used' });
  sources.push({
    kind: 'pr_body',
    ref: 'description',
    status: 'used',
    ...(bodySubstantive ? {} : { note: 'no substantive description' }),
  });

  const parsed = parseReferences({ title, body: bodyRaw, branch: pull.branch }, repo, pull.number);

  // ---- linked docs, read at head_sha (never the working tree) ------------
  const docs: CollectedSources['docs'] = [];
  let fetchAttempted = false;
  let gitUnavailable = false;
  for (const path of parsed.docPaths) {
    let content = await deps.git.readFileAt(repo, pull.headSha, path);
    if (content == null && !fetchAttempted) {
      fetchAttempted = true;
      try {
        await withTimeout(deps.git.fetchPullHead(repo, pull.number), GIT_FETCH_TIMEOUT_MS);
        content = await deps.git.readFileAt(repo, pull.headSha, path);
      } catch {
        gitUnavailable = true;
      }
    } else if (content == null && fetchAttempted && !gitUnavailable) {
      content = await deps.git.readFileAt(repo, pull.headSha, path);
    }
    if (content == null) {
      const prFile = files.find((f) => f.path === path);
      content = contentFromAddedFilePatch(prFile?.patch);
    }
    if (content == null) {
      if (gitUnavailable) {
        degraded = true;
        sources.push({ kind: 'linked_doc', ref: path, status: 'unresolved', note: 'clone unavailable' });
      } else {
        sources.push({
          kind: 'linked_doc',
          ref: path,
          status: 'unresolved',
          note: `not found at ${pull.headSha.slice(0, 7)}`,
        });
      }
      continue;
    }
    if (content.length > MAX_DOC_CHARS) {
      docs.push({ path, content: content.slice(0, MAX_DOC_CHARS), truncated: true });
      sources.push({
        kind: 'linked_doc',
        ref: path,
        status: 'truncated',
        note: `truncated to ${MAX_DOC_CHARS} chars`,
      });
    } else {
      docs.push({ path, content, truncated: false });
      sources.push({ kind: 'linked_doc', ref: path, status: 'used' });
    }
  }

  // ---- linked issues, same repo only --------------------------------------
  const issues: CollectedSources['issues'] = [];
  if (parsed.issueNumbers.length > 0) {
    const gh = await deps.github().catch(() => null);
    if (!gh) {
      degraded = true;
      for (const n of parsed.issueNumbers) {
        sources.push({ kind: 'linked_issue', ref: String(n), status: 'unresolved', note: 'GitHub unavailable' });
      }
    } else {
      for (const n of parsed.issueNumbers) {
        try {
          const issue = await gh.getIssue(repo, n);
          const rawBody = issue.body ?? '';
          if (rawBody.length > MAX_ISSUE_CHARS) {
            issues.push({ number: n, title: issue.title, body: rawBody.slice(0, MAX_ISSUE_CHARS) });
            sources.push({
              kind: 'linked_issue',
              ref: String(n),
              status: 'truncated',
              note: `truncated to ${MAX_ISSUE_CHARS} chars`,
            });
          } else {
            issues.push({ number: n, title: issue.title, body: rawBody });
            sources.push({ kind: 'linked_issue', ref: String(n), status: 'used' });
          }
        } catch (err) {
          if (issueStatus(err) === 'not_found') {
            sources.push({ kind: 'linked_issue', ref: String(n), status: 'unresolved', note: 'not found' });
          } else {
            degraded = true;
            sources.push({
              kind: 'linked_issue',
              ref: String(n),
              status: 'unresolved',
              note: 'GitHub unavailable',
            });
          }
        }
      }
    }
  }

  // ---- references that are deliberately never fetched --------------------
  for (const u of parsed.unresolved) sources.push(u);

  // ---- indirect data -------------------------------------------------------
  const commitSubjects = commits
    .slice(0, MAX_COMMITS)
    .map((c) => c.message.split('\n')[0]?.slice(0, MAX_COMMIT_SUBJECT_CHARS) ?? '');
  const listedFiles = files.slice(0, MAX_FILES_LISTED).map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
  }));
  const labels = pull.labels.slice(0, MAX_LABELS);

  sources.push({ kind: 'branch_name', ref: 'branch', status: 'used' });
  sources.push({ kind: 'commit_messages', ref: 'commits', status: 'used' });
  sources.push({ kind: 'changed_files', ref: 'changed_files', status: 'used' });
  if (labels.length > 0) sources.push({ kind: 'labels', ref: 'labels', status: 'used' });

  return {
    title,
    body: bodyRaw,
    bodySubstantive,
    docs,
    issues,
    indirect: { branch: pull.branch, commitSubjects, files: listedFiles, labels },
    sources,
    degraded,
  };
}
