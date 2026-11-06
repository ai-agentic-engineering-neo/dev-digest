// Collects every intent source in code (never the model). Nothing here throws per source and
// no URL is ever fetched: issues go through GitHubClient.getIssue (same repo), docs through the clone.
import type { GitClient, GitHubClient } from '@devdigest/shared';
import type {
  IntentInputBundle,
  IntentSource,
  IntentSourceReason,
  IntentSourceStatus,
  OfferedSource,
} from './domain/types.js';
import type { IntentPullContext, IntentRepositoryPort } from './ports.js';
import { assessBody } from './domain/confidence.js';
import { branchRefs, newSideFromPatch, parseBodyRefs, type BodyRefs, type IssueRef } from './domain/refs.js';
import {
  INTENT_INPUT_MAX_CHARS,
  MAX_BODY_CHARS,
  MAX_BRANCH_CHARS,
  MAX_COMMIT_CHARS,
  MAX_COMMITS,
  MAX_DOCS_READ,
  MAX_DOC_CHARS,
  MAX_EXTERNAL_LINKS,
  MAX_ISSUES_FETCHED,
  MAX_ISSUE_CHARS,
  MAX_PATHS,
  MAX_TITLE_CHARS,
  MAX_TRACKER_KEYS,
} from './constants.js';

export interface GatherDeps {
  repo: IntentRepositoryPort;
  git: GitClient;
  github: () => Promise<GitHubClient>;
}

interface Entry {
  source: IntentSource;
  text: string | null;
  label: string;
}

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s);
const labelSafe = (s: string): string => s.replace(/["<>\n\r]/g, '');

function mk(
  partial: Pick<IntentSource, 'id' | 'kind' | 'ref' | 'weight'> & Partial<IntentSource>,
  text: string | null,
  label: string,
  status: IntentSourceStatus = 'read',
  reason: IntentSourceReason | null = null,
): Entry {
  return {
    source: {
      issue_number: null,
      path: null,
      used: false,
      cited: false,
      ...partial,
      status,
      reason,
    },
    text,
    label,
  };
}

const EMPTY_REFS: BodyRefs = { issues: [], docs: [], unsafeDocs: [], externalHosts: [], trackerKeys: [] };

export async function gatherIntentInput(deps: GatherDeps, ctx: IntentPullContext): Promise<IntentInputBundle> {
  const refs = ctx.body ? parseBodyRefs(ctx.body, { owner: ctx.owner, name: ctx.name }, ctx.number) : EMPTY_REFS;
  const branch = branchRefs(ctx.branch);

  const [commitMessages, files] = await Promise.all([
    deps.repo.listCommitMessages(ctx.prId, MAX_COMMITS).catch((): string[] => []),
    deps.repo.listChangedFiles(ctx.prId).catch(() => []),
  ]);

  // ---- 1. PR body -------------------------------------------------------
  const body = assessBody(ctx.body);
  const gBody: Entry[] = [];
  if (body.quality === 'empty') {
    gBody.push(mk({ id: 'pr_body', kind: 'pr_body', ref: 'PR body', weight: 'strong' }, null, 'pr-body', 'empty', body.templateOnly ? 'template_only' : null));
  } else {
    gBody.push(mk({ id: 'pr_body', kind: 'pr_body', ref: 'PR body', weight: 'strong' }, clip(ctx.body ?? '', MAX_BODY_CHARS), 'pr-body'));
  }

  // ---- 2. Linked docs ---------------------------------------------------
  const patches = new Map(files.map((f) => [f.path, f.patch] as const));
  const gDocs: Entry[] = [];
  const gSkipped: Entry[] = [];
  refs.docs.forEach((doc, i) => {
    if (i >= MAX_DOCS_READ) {
      gSkipped.push(mk({ id: `doc:${doc.path}`, kind: doc.kind, ref: doc.path, weight: 'strong', path: doc.path }, null, '', 'skipped_cap', 'cap'));
    }
  });
  const readDoc = async (doc: BodyRefs['docs'][number]): Promise<Entry> => {
    const base = { id: `doc:${doc.path}`, kind: doc.kind, ref: doc.path, weight: 'strong' as const, path: doc.path };
    const label = labelSafe(`doc-${doc.path}`);
    const patch = patches.get(doc.path);
    if (patch) {
      const side = newSideFromPatch(patch);
      if (side && side.text.trim() !== '') {
        return mk(base, clip(side.text, MAX_DOC_CHARS), label, 'read', side.complete ? null : 'pr_diff_excerpt');
      }
    }
    if (!ctx.cloned) return mk(base, null, label, 'unavailable', 'not_cloned');
    let text: string;
    try {
      text = await deps.git.readFile({ owner: ctx.owner, name: ctx.name }, doc.path);
    } catch {
      return mk(base, null, label, 'unavailable', 'not_found');
    }
    if (text.includes('\0')) return mk(base, null, label, 'unavailable', 'binary');
    if (text.trim() === '') return mk(base, null, label, 'empty');
    return mk(base, clip(text, MAX_DOC_CHARS), label);
  };
  gDocs.push(...(await Promise.all(refs.docs.slice(0, MAX_DOCS_READ).map(readDoc))));
  for (const raw of refs.unsafeDocs) {
    gDocs.push(mk({ id: `doc:${raw}`, kind: 'doc', ref: raw, weight: 'strong' }, null, '', 'unavailable', 'unsafe_path'));
  }

  // ---- 3 + 5. Issues ----------------------------------------------------
  const sameRepo: IssueRef[] = [];
  const seenNumbers = new Set<number>();
  const cross: IssueRef[] = [];
  for (const ref of refs.issues) {
    if (ref.crossRepo) {
      cross.push(ref);
    } else if (!seenNumbers.has(ref.number)) {
      seenNumbers.add(ref.number);
      sameRepo.push(ref);
    }
  }
  if (branch.issue !== null && branch.issue !== ctx.number && !seenNumbers.has(branch.issue)) {
    sameRepo.push({ number: branch.issue, weight: 'weak', crossRepo: null, via: 'branch' });
  }
  const ordered = [...sameRepo.filter((r) => r.weight === 'strong'), ...sameRepo.filter((r) => r.weight === 'weak')];
  const toFetch = ordered.slice(0, MAX_ISSUES_FETCHED);
  for (const r of ordered.slice(MAX_ISSUES_FETCHED)) {
    gSkipped.push(mk({ id: `issue:${r.number}`, kind: 'issue', ref: `#${r.number}`, weight: r.weight, issue_number: r.number }, null, '', 'skipped_cap', 'cap'));
  }
  for (const r of cross.slice(0, MAX_EXTERNAL_LINKS)) {
    const ref = `${r.crossRepo}#${r.number}`;
    // issue_number is null: the client links issue_number to the CURRENT repo; the ref keeps `other/repo#N`.
    gSkipped.push(mk({ id: `xrepo:${ref}`, kind: 'issue', ref, weight: r.weight, issue_number: null }, null, '', 'skipped_cross_repo'));
  }

  let known = new Set<number>();
  if (toFetch.length > 0) {
    known = await deps.repo.knownPullNumbers(ctx.repoId, toFetch.map((r) => r.number)).catch(() => new Set<number>());
  }
  let ghPromise: Promise<GitHubClient | null> | undefined;
  const getGh = (): Promise<GitHubClient | null> => (ghPromise ??= deps.github().then((c): GitHubClient | null => c, () => null));

  const fetchIssue = async (r: IssueRef): Promise<Entry> => {
    const base = { id: `issue:${r.number}`, kind: 'issue' as const, ref: `#${r.number}`, weight: r.weight, issue_number: r.number };
    const label = `issue-${r.number}`;
    if (known.has(r.number)) return mk(base, null, label, 'unavailable', 'pull_request');
    const gh = await getGh();
    if (!gh) return mk(base, null, label, 'unavailable', 'github_unavailable');
    try {
      const issue = await gh.getIssue({ owner: ctx.owner, name: ctx.name }, r.number);
      const text = clip(`${issue.title}\n\n${issue.body ?? ''}`.trim(), MAX_ISSUE_CHARS);
      return text === '' ? mk(base, null, label, 'empty') : mk(base, text, label);
    } catch {
      return mk(base, null, label, 'unavailable', 'not_found');
    }
  };
  const issueEntries = await Promise.all(toFetch.map(fetchIssue));
  const gClosing = issueEntries.filter((e) => e.source.weight === 'strong');
  const gWeak = issueEntries.filter((e) => e.source.weight === 'weak');

  // ---- 4, 6, 7, 8. title / commits / branch / paths ---------------------
  const gTitle = [mk({ id: 'title', kind: 'title', ref: 'Title', weight: 'strong' }, clip(ctx.title, MAX_TITLE_CHARS), 'pr-title')];
  const gCommits: Entry[] =
    commitMessages.length > 0
      ? [mk({ id: 'commits', kind: 'commits', ref: `${commitMessages.length} commits`, weight: 'weak' }, commitMessages.map((m) => `- ${clip(m.split('\n')[0] ?? '', MAX_COMMIT_CHARS)}`).join('\n'), 'commits')]
      : [];
  const gBranch: Entry[] = ctx.branch.trim() ? [mk({ id: 'branch', kind: 'branch', ref: clip(ctx.branch, MAX_BRANCH_CHARS), weight: 'weak' }, clip(ctx.branch, MAX_BRANCH_CHARS), 'branch')] : [];
  const paths = files.map((f) => f.path).sort().slice(0, MAX_PATHS);
  const gPaths: Entry[] = paths.length > 0 ? [mk({ id: 'paths', kind: 'paths', ref: `${paths.length} paths`, weight: 'weak' }, paths.join('\n'), 'paths')] : [];

  // ---- recorded-only: external links, tracker keys ----------------------
  for (const host of refs.externalHosts.slice(0, MAX_EXTERNAL_LINKS)) {
    gSkipped.push(mk({ id: `external:${host}`, kind: 'external_link', ref: host, weight: 'weak' }, null, '', 'skipped_external'));
  }
  const keys = [...refs.trackerKeys];
  if (branch.trackerKey && !keys.includes(branch.trackerKey)) keys.push(branch.trackerKey);
  for (const key of keys.slice(0, MAX_TRACKER_KEYS)) {
    gSkipped.push(mk({ id: `tracker:${key}`, kind: 'tracker_key', ref: key, weight: 'weak' }, null, '', 'unresolved'));
  }

  // ---- assemble in priority order, cap total input ----------------------
  const entries = [...gBody, ...gDocs, ...gClosing, ...gTitle, ...gWeak, ...gCommits, ...gBranch, ...gPaths];
  const offeredEntries = entries.filter((e) => e.source.status === 'read' && e.text !== null && e.text.trim() !== '');
  let total = offeredEntries.reduce((n, e) => n + (e.text?.length ?? 0), 0);
  for (let i = offeredEntries.length - 1; i >= 0 && total > INTENT_INPUT_MAX_CHARS; i--) {
    const e = offeredEntries[i];
    if (!e || e.text === null) continue;
    const cut = Math.min(e.text.length, total - INTENT_INPUT_MAX_CHARS);
    e.text = e.text.slice(0, e.text.length - cut);
    total -= cut;
    if (e.text.trim() === '') {
      e.text = null;
      e.source.status = 'skipped_cap';
      e.source.reason = 'cap';
    }
  }

  const offered: OfferedSource[] = [];
  for (const e of offeredEntries) {
    if (e.text === null || e.source.status !== 'read') continue;
    e.source.used = true;
    offered.push({ id: e.source.id, label: e.label, text: e.text });
  }

  return {
    sources: [...entries, ...gSkipped].map((e) => e.source),
    offered,
    bodyQuality: body.quality,
  };
}
