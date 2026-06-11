import type { Container } from '../../platform/container.js';
import type { ChatMessage, ConventionCandidate, RepoRef } from '@devdigest/shared';
import { assemblePrompt, wrapUntrusted } from '../../platform/prompt.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import * as schema from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import type { ConventionsRepository } from './repository.js';
import { groundEvidence, toCandidate, type GroundedItem } from './helpers.js';
import {
  Extraction,
  FileSelection,
  SELECTOR_SYSTEM,
  SELECT_TASK,
  EXTRACT_FOLLOWUP,
  EXTRACTION_SCHEMA_NAME,
  FILE_SELECTION_SCHEMA_NAME,
  MAX_SELECTED_FILES,
  MAX_SAMPLE_FILES,
  MAX_FILE_BYTES,
  SELECTION_BYTE_BUDGET,
  MAP_BYTE_BUDGET,
  MAX_SYMBOLS_PER_FILE,
  SAMPLE_GREP_PATTERN,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_MAX_RETRIES,
  DEFAULT_MODEL,
} from './constants.js';

/**
 * A1 — conventions extraction pipeline (extracted from ConventionsService;
 * behaviour identical). Plain functions taking the container + repo; the
 * service's `extract` is a thin wrapper around `runExtraction`.
 */

interface RepoRow {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

/** 2-step LLM-driven extraction (see service class header) → persist fresh candidates. */
export async function runExtraction(
  container: Container,
  repo: ConventionsRepository,
  workspaceId: string,
  repoId: string,
  opts: { provider?: 'openai' | 'anthropic'; model?: string } = {},
): Promise<ConventionCandidate[]> {
  const repoRow = await loadRepo(container, workspaceId, repoId);
  if (!repoRow.clonePath) {
    throw new AppError('repo_not_cloned', 'Repo is not cloned yet — clone it first', 409);
  }
  const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };

  const map = await buildRepoMap(container, ref);
  if (map.paths.size === 0) {
    // nothing to analyze → clear stale candidates, return empty
    await repo.replaceForRepo(workspaceId, repoId, []);
    return [];
  }

  const provider = opts.provider ?? 'openai';
  const llm = await container.llm(provider);
  const model = opts.model ?? (await defaultModel(container, provider));

  // --- Step 1: the model picks files from the REPO MAP (no bodies sent yet). ---
  const { messages } = assemblePrompt({
    system: SELECTOR_SYSTEM,
    task: SELECT_TASK(repoRow.owner, repoRow.name),
    diff: map.text, // REPO MAP wrapped as <untrusted> inside assemblePrompt
  });
  const selection = await llm.completeStructured<FileSelection>({
    model,
    schema: FileSelection,
    schemaName: FILE_SELECTION_SCHEMA_NAME,
    messages,
    temperature: EXTRACTION_TEMPERATURE,
    maxRetries: EXTRACTION_MAX_RETRIES,
  });

  // Validate picks against the map (drop hallucinated paths), cap, then read.
  const picked = selection.data.files
    .filter((p) => map.paths.has(p))
    .slice(0, MAX_SELECTED_FILES);
  let files = await readSelectedFiles(container, ref, picked);
  if (files.length === 0) {
    // T3: when the model picks nothing, prefer rank-driven samples (top files
    // by import-graph rank, minus tests/configs) over the legacy grep heuristic.
    // Both degrade to [] cleanly (flag off / unindexed → heuristic fallback).
    let ranked: string[] = [];
    try {
      ranked = await container.repoIntel.getConventionSamples(repoId, MAX_SELECTED_FILES);
    } catch {
      /* degrade to the heuristic below */
    }
    if (ranked.length > 0) files = await readSelectedFiles(container, ref, ranked);
    if (files.length === 0) files = await sampleFiles(container, ref); // heuristic fallback
  }
  if (files.length === 0) {
    await repo.replaceForRepo(workspaceId, repoId, []);
    return [];
  }

  // --- Step 2: SAME conversation — send the full file bodies, extract. ---
  const codeBlob = files.map((f) => `FILE: ${f.path}\n${f.content}`).join('\n\n---\n\n');
  const extractMessages: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify({ files: files.map((f) => f.path) }) },
    { role: 'user', content: `${EXTRACT_FOLLOWUP}\n\n${wrapUntrusted('files', codeBlob)}` },
  ];
  const result = await llm.completeStructured<Extraction>({
    model,
    schema: Extraction,
    schemaName: EXTRACTION_SCHEMA_NAME,
    messages: extractMessages,
    temperature: EXTRACTION_TEMPERATURE,
    maxRetries: EXTRACTION_MAX_RETRIES,
  });

  // Ground each candidate's evidence against the files we actually read.
  const byPath = new Map(files.map((f) => [f.path, f.content] as const));
  const grounded = result.data.conventions
    .map((c) => groundEvidence(c, byPath))
    .filter((c): c is GroundedItem => c !== null);

  const rows = await repo.replaceForRepo(
    workspaceId,
    repoId,
    grounded.map((c) => ({
      workspaceId,
      repoId,
      rule: c.rule,
      evidencePath: c.evidence_path,
      evidenceSnippet: c.evidence_snippet,
      confidence: c.confidence,
    })),
  );
  return rows.map(toCandidate);
}

async function loadRepo(
  container: Container,
  workspaceId: string,
  repoId: string,
): Promise<RepoRow> {
  const [row] = await container.db
    .select({
      id: schema.repos.id,
      owner: schema.repos.owner,
      name: schema.repos.name,
      clonePath: schema.repos.clonePath,
    })
    .from(schema.repos)
    .where(and(eq(schema.repos.workspaceId, workspaceId), eq(schema.repos.id, repoId)));
  if (!row) throw new NotFoundError('Repo not found');
  return row;
}

/**
 * Sample up to `maxFiles` source files from the repo (via symbols, falling
 * back to a grep for common extensions) and read them through the GitClient.
 */
async function sampleFiles(
  container: Container,
  ref: RepoRef,
  maxFiles = MAX_SAMPLE_FILES,
): Promise<{ path: string; content: string }[]> {
  const paths = new Set<string>();
  try {
    const symbols = await container.codeIndex.symbols(ref);
    for (const s of symbols) {
      paths.add(s.path);
      if (paths.size >= maxFiles) break;
    }
  } catch {
    /* index may be unavailable; fall through to grep */
  }
  if (paths.size < maxFiles) {
    try {
      const matches = await container.codeIndex.grep(ref, SAMPLE_GREP_PATTERN);
      for (const m of matches) {
        paths.add(m.path);
        if (paths.size >= maxFiles) break;
      }
    } catch {
      /* ignore */
    }
  }
  const out: { path: string; content: string }[] = [];
  for (const p of paths) {
    const content = await container.git.readFile(ref, p).catch(() => '');
    if (content.trim()) out.push({ path: p, content: content.slice(0, MAX_FILE_BYTES) });
  }
  return out;
}

/**
 * Build a compact REPO MAP (one line per file: `path — symbols`) entirely
 * locally via CodeIndex — no LLM, no file bodies. This is what the model sees
 * in step 1 to decide which files it wants. Bounded by MAP_BYTE_BUDGET.
 */
async function buildRepoMap(
  container: Container,
  ref: RepoRef,
): Promise<{ text: string; paths: Set<string> }> {
  const byFile = new Map<string, string[]>();
  const order: string[] = [];
  const note = (path: string): string[] => {
    let arr = byFile.get(path);
    if (!arr) {
      arr = [];
      byFile.set(path, arr);
      order.push(path);
    }
    return arr;
  };
  try {
    const symbols = await container.codeIndex.symbols(ref);
    for (const s of symbols) {
      const arr = note(s.path);
      if (arr.length < MAX_SYMBOLS_PER_FILE) arr.push(`${s.kind} ${s.name}`);
    }
  } catch {
    /* index may be unavailable; fall through to grep */
  }
  if (byFile.size === 0) {
    try {
      const matches = await container.codeIndex.grep(ref, SAMPLE_GREP_PATTERN);
      for (const m of matches) note(m.path);
    } catch {
      /* ignore */
    }
  }
  const lines: string[] = [];
  const paths = new Set<string>();
  let size = 0;
  for (const p of order) {
    const syms = byFile.get(p)!;
    const line = syms.length ? `${p} — ${syms.join(', ')}` : p;
    if (size + line.length + 1 > MAP_BYTE_BUDGET) break;
    lines.push(line);
    paths.add(p);
    size += line.length + 1;
  }
  return { text: lines.join('\n'), paths };
}

/**
 * Read the model-selected files through the GitClient, capping each body at
 * MAX_FILE_BYTES and the total at SELECTION_BYTE_BUDGET (so step 2 stays within
 * the context budget regardless of how many files the model asked for).
 */
async function readSelectedFiles(
  container: Container,
  ref: RepoRef,
  paths: string[],
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  let total = 0;
  for (const p of paths) {
    if (out.length >= MAX_SELECTED_FILES || total >= SELECTION_BYTE_BUDGET) break;
    const raw = await container.git.readFile(ref, p).catch(() => '');
    if (!raw.trim()) continue;
    const content = raw.slice(0, MAX_FILE_BYTES);
    out.push({ path: p, content });
    total += content.length;
  }
  return out;
}

/** Pick the model: our pinned default if the provider grants it, else first available. */
async function defaultModel(
  container: Container,
  provider: 'openai' | 'anthropic',
): Promise<string> {
  const preferred = DEFAULT_MODEL[provider];
  try {
    const llm = await container.llm(provider);
    const models = await llm.listModels();
    if (models.some((m) => m.id === preferred)) return preferred;
    return models[0]?.id ?? preferred;
  } catch {
    return preferred;
  }
}
