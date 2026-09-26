import { z } from 'zod';
import type { ChatMessage } from '@devdigest/shared';
import type { SampleFile } from './helpers.js';

/**
 * C2 — the single structured LLM call. Schema name is `ConventionExtraction`
 * (server/specs/conventions.md); this schema is internal to the extraction
 * call, never sent to the client, so it lives here rather than in
 * `vendor/shared`.
 */
export const ConventionExtractionCandidate = z.object({
  category: z.string(),
  rule: z.string(),
  evidence: z.object({
    path: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int(),
  }),
  confidence: z.number().min(0).max(1),
});

export const ConventionExtraction = z.object({
  candidates: z.array(ConventionExtractionCandidate),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

const SYSTEM_PROMPT = `You are analyzing a codebase to extract its house coding conventions — rules
a reviewer should enforce on future changes because the codebase already follows them
consistently, not generic best-practice advice that would apply to any project.

Read the sampled files below and identify 5 to 15 conventions that RECUR across
multiple files or are clearly established in at least one file (naming, error
handling, module structure, import style, testing patterns, and similar). For
each convention, cite ONE representative real line range from the samples you
were given — never a line you did not see, never a file not in the sample set.

Do not report:
- A rule that appears in only a single, isolated line with no pattern.
- Generic advice ("write tests", "handle errors") with no concrete evidence.
- Anything about formatting a linter/formatter config already enforces
  mechanically — the config files are shown to you for context, not to be
  restated as conventions.

For each candidate, give a short category label (e.g. "Naming", "Error handling",
"Module structure"), the rule stated as an instruction to a future reviewer, the
exact file path and 1-indexed start/end line of your citing evidence (span at
most 30 lines), and a confidence from 0 to 1 reflecting how consistently the
sampled files follow it.`;

/** Build the two-message request for `completeStructured`. */
export function buildExtractionMessages(files: SampleFile[]): ChatMessage[] {
  const sections = files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Sampled files:\n\n${sections}`,
    },
  ];
}
