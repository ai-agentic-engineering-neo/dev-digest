import { promptFingerprint, wrapUntrusted } from '@devdigest/reviewer-core';
import type { PromptLogSection } from '../../platform/prompt-log.js';
import type { IntentSource, IntentSourceKind } from '@devdigest/shared';
import type { CollectedSources, StoredIntent } from './types.js';

/**
 * Renders the USER message sent to the classification model. Every
 * author- or repo-derived section is delimiter-wrapped — the same
 * `wrapUntrusted` the review prompt uses — so the intent model treats this
 * text as data, exactly like a reviewer agent does. Section headers are
 * trusted, fixed text written by this module, never by the PR author.
 */
export function renderDerivationPrompt(
  collected: CollectedSources,
  pr: { number: number },
): { text: string; sections: PromptLogSection[] } {
  const parts: string[] = [];
  const sections: PromptLogSection[] = [];
  const add = (
    name: string,
    source: string,
    items: { label: string; text: string }[],
    wrapped = true,
  ) => {
    const texts = items.map((i) => i.text);
    parts.push(...texts);
    const joined = texts.join('\n\n');
    sections.push({
      name,
      source,
      wrapped,
      chars: joined.length,
      ...(items.length > 1 ? { items: texts.map((t) => t.length) } : {}),
      fingerprint: promptFingerprint(joined),
      details: items.map((i) => ({ label: i.label, chars: i.text.length })),
    });
  };

  add('task', 'pr-metadata', [{ label: `#${pr.number}`, text: `Classify the intent of PR #${pr.number}.` }], false);
  add('pr_title', 'github-pr', [
    { label: 'title', text: `## PR title\n${wrapUntrusted('pr-title', collected.title)}` },
  ]);
  if (collected.body.trim().length > 0) {
    add('pr_body', 'github-pr', [
      { label: 'body', text: `## PR description\n${wrapUntrusted('pr-body', collected.body)}` },
    ]);
  }
  if (collected.docs.length > 0) {
    add(
      'linked_docs',
      'repo-file@head',
      collected.docs.map((doc) => ({
        label: doc.path,
        text: `## Linked doc: ${doc.path}\n${wrapUntrusted(`doc:${doc.path}`, doc.content)}`,
      })),
    );
  }
  if (collected.issues.length > 0) {
    add(
      'linked_issues',
      'github-issue',
      collected.issues.map((issue) => ({
        label: `#${issue.number}`,
        text: `## Issue #${issue.number}: ${issue.title}\n${wrapUntrusted(`issue-${issue.number}`, issue.body)}`,
      })),
    );
  }
  if (collected.indirect.branch) {
    add('branch', 'pr-metadata', [
      { label: 'branch', text: `## Branch\n${wrapUntrusted('branch', collected.indirect.branch)}` },
    ]);
  }
  if (collected.indirect.commitSubjects.length > 0) {
    add('commits', 'pr-metadata', [
      {
        label: `${collected.indirect.commitSubjects.length} commit(s)`,
        text: `## Commits\n${wrapUntrusted('commits', collected.indirect.commitSubjects.join('\n'))}`,
      },
    ]);
  }
  if (collected.indirect.files.length > 0) {
    const filesText = collected.indirect.files
      .map((f) => `${f.path} (+${f.additions} -${f.deletions})`)
      .join('\n');
    add('changed_files', 'pr-metadata', [
      {
        label: `${collected.indirect.files.length} file(s)`,
        text: `## Changed files\n${wrapUntrusted('files', filesText)}`,
      },
    ]);
  }
  if (collected.indirect.labels.length > 0) {
    add('labels', 'pr-metadata', [
      {
        label: `${collected.indirect.labels.length} label(s)`,
        text: `## Labels\n${wrapUntrusted('labels', collected.indirect.labels.join(', '))}`,
      },
    ]);
  }

  return { text: parts.join('\n\n'), sections };
}

function sourceLabel(kind: IntentSourceKind, ref: string): string {
  switch (kind) {
    case 'pr_title':
      return 'title';
    case 'pr_body':
      return 'description';
    case 'linked_doc':
      return ref;
    case 'linked_issue':
      return `issue #${ref}`;
    case 'branch_name':
      return 'branch';
    case 'commit_messages':
      return 'commits';
    case 'changed_files':
      return 'changed files';
    case 'labels':
      return 'labels';
    case 'ticket_ref':
    case 'external_link':
      return ref;
  }
}

function describeSources(sources: IntentSource[]): string {
  const used = sources.filter((s) => s.status === 'used' || s.status === 'truncated');
  const docs = used.filter((s) => s.kind === 'linked_doc');
  const issues = used.filter((s) => s.kind === 'linked_issue');
  const bodyUsed = used.some((s) => s.kind === 'pr_body');

  const parts: string[] = [];
  if (docs.length > 0) {
    parts.push(`a linked spec (${docs.map((d) => d.ref).join(', ')})`);
  }
  if (issues.length > 0) {
    const label = issues.length > 1 ? 'linked issues' : 'a linked issue';
    parts.push(`${label} (${issues.map((i) => `#${i.ref}`).join(', ')})`);
  }
  if (bodyUsed) parts.push('the PR description');

  if (parts.length === 0) return 'from indirect data (branch, commits, changed files)';
  return `from ${parts.join(' and ')}`;
}

/** Renders the Intent card / trace / prompt block from a stored row. */
export function renderIntentBlock(stored: StoredIntent): string {
  const inScope =
    stored.inScope.length > 0 ? stored.inScope.map((s) => `- ${s}`).join('\n') : '- none stated';
  const outOfScope =
    stored.outOfScope.length > 0
      ? stored.outOfScope.map((s) => `- ${s}`).join('\n')
      : '- none stated';

  const lines: string[] = [
    `Confidence: ${stored.confidence} — ${describeSources(stored.sources)}`,
    `Intent: ${stored.intent}`,
    `In scope:\n${inScope}`,
    `Out of scope:\n${outOfScope}`,
  ];
  if (stored.riskAreas.length > 0) {
    lines.push(`Risk areas: ${stored.riskAreas.join(', ')}`);
  }

  const usedLabels = stored.sources
    .filter((s) => s.status !== 'unresolved')
    .map((s) => sourceLabel(s.kind, s.ref));
  const unresolvedLabels = stored.sources
    .filter((s) => s.status === 'unresolved')
    .map((s) => (s.note ? `${sourceLabel(s.kind, s.ref)} (${s.note})` : sourceLabel(s.kind, s.ref)));

  let derivedFrom = `Derived from: ${usedLabels.join(', ')}`;
  if (unresolvedLabels.length > 0) {
    derivedFrom += ` · unresolved: ${unresolvedLabels.join(', ')}`;
  }
  lines.push(derivedFrom);

  return lines.join('\n');
}
