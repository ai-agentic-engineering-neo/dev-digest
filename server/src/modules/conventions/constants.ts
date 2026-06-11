import { z } from 'zod';
import type { Provider } from '@devdigest/shared';

/**
 * A1 — conventions module constants (extracted from service.ts; no behaviour
 * change). Schemas, prompts, and tunables for the extraction flow.
 */

/** LLM output schema for a single extracted convention candidate. */
export const ExtractionItem = z.object({
  rule: z.string().describe('A concise house-rule the codebase follows, phrased as a guideline.'),
  evidence_path: z.string().describe('Repo-relative path of a file demonstrating the rule.'),
  evidence_snippet: z.string().describe('A short verbatim snippet from that file as evidence.'),
  confidence: z.number().min(0).max(1),
});

/** LLM output schema for the (step-2) structured extraction call. */
export const Extraction = z.object({ conventions: z.array(ExtractionItem).max(20) });
export type Extraction = z.infer<typeof Extraction>;

/**
 * Step-1 schema: the model picks the files it wants to read (from the repo map)
 * before any file body is sent. Returned paths are validated against the map.
 */
export const FileSelection = z.object({
  files: z
    .array(z.string())
    .max(20)
    .describe('Repo-relative paths most useful for extracting conventions.'),
});
export type FileSelection = z.infer<typeof FileSelection>;

// ----- tunables -----

/** Max files the selector may pick / we read per extraction. */
export const MAX_SELECTED_FILES = 15;

/** Max files to sample from a repo per extraction (heuristic fallback). */
export const MAX_SAMPLE_FILES = 8;

/** Max bytes read per selected/sampled file. */
export const MAX_FILE_BYTES = 10_000;

/** Total byte budget for the selected file bodies sent in step 2 (~45K tokens). */
export const SELECTION_BYTE_BUDGET = 180_000;

/** Byte budget for the REPO MAP sent in step 1. */
export const MAP_BYTE_BUDGET = 60_000;

/** Max symbols listed per file in the REPO MAP (keeps the map compact). */
export const MAX_SYMBOLS_PER_FILE = 8;

// ----- prompts -----

/**
 * Shared system prompt for the 2-step dialogue (file selection → extraction).
 * The injection guard is appended by assemblePrompt; both steps reuse one
 * conversation, so the model keeps context between picking files and analyzing
 * them.
 */
export const SELECTOR_SYSTEM =
  'You are a senior engineer analyzing a repository to surface its implicit ' +
  'house-rules / conventions (naming, error handling, structure, testing, API ' +
  'shape). You work in two steps: first you are shown a REPO MAP (paths + the ' +
  'symbols each file declares) and pick the files most representative of the ' +
  "codebase's conventions; then you are given those files' full contents and " +
  'extract the conventions, each backed by concrete file evidence.';

/** Step-1 task framing. */
export const SELECT_TASK = (owner: string, name: string): string =>
  `Repo ${owner}/${name}. From the REPO MAP below, choose up to ${MAX_SELECTED_FILES} ` +
  'files that best reveal the house-rules this codebase follows. Prefer entrypoints, ' +
  'routes/handlers, core modules, a test, config, and an error-handling file; spread ' +
  'the picks across areas rather than clustering in one folder.';

/** Step-2 follow-up (same dialogue): instructions that precede the file bodies. */
export const EXTRACT_FOLLOWUP =
  'Now extract the conventions from the FULL FILE CONTENTS below. Return ONLY ' +
  'conventions you can back with a concrete file + snippet from these files. Each ' +
  'convention needs an evidence_path, a short verbatim evidence_snippet copied from ' +
  'that file, and a confidence 0..1.';

/** Legacy single-shot extractor system prompt (kept for the heuristic fallback). */
export const EXTRACTOR_SYSTEM =
  'You are a senior engineer extracting the implicit house-rules / conventions a ' +
  'codebase follows (naming, error handling, structure, testing, API shape). ' +
  'Return ONLY conventions you can back with a concrete file + snippet from the ' +
  'provided code. Each convention needs evidence_path, a short verbatim ' +
  'evidence_snippet copied from that file, and a confidence 0..1.';

/** Names passed to the structured-output calls. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
export const FILE_SELECTION_SCHEMA_NAME = 'ConventionFileSelection';

/** Grep pattern used to find candidate source files when symbols are sparse. */
export const SAMPLE_GREP_PATTERN = '(function|class|export|def )';

/** Confidence ceiling applied when an evidence snippet can't be grounded. */
export const UNGROUNDED_CONFIDENCE_CEILING = 0.5;

/** Structured-call tuning. */
export const EXTRACTION_TEMPERATURE = 0;
export const EXTRACTION_MAX_RETRIES = 2;

/** Default models per provider (used when the provider lists none). */
export const DEFAULT_MODEL: Record<Provider, string> = {
  openai: 'gpt-5.4',
  anthropic: 'claude-3-5-sonnet',
  openrouter: 'deepseek/deepseek-v4-flash',
};

/** Max length of the skill name derived from an accepted convention's rule. */
export const ACCEPTED_SKILL_NAME_MAX_LEN = 80;
