import type { ChatMessage } from '@devdigest/shared';
import { MAX_FILE_CHARS } from './constants.js';
import type { SampledFile } from './samples.js';

/**
 * System prompt for the Conventions Extractor's one LLM call. A feature's own
 * prompt (not a user-editable agent prompt), so it lives here as a constant
 * like reviewer-core's inline prompts rather than in `docs/agent-prompts/`.
 */
export const CONVENTIONS_SYSTEM_PROMPT = `You read a sample of a codebase's config files and source files and propose
concrete, PROJECT-SPECIFIC coding conventions — not generic style advice a
linter or formatter already enforces ("use consistent naming", "add semicolons").

A good candidate is something a new contributor to THIS repo would not know
without reading the code, and that a reviewer could check in a diff:
"routes return Result<T, ApiError>, never throw", "Redis access goes through
the lib/redis.ts singleton", "async/await only, no .then() chains".

Rules:
- Only propose a pattern you see repeated or clearly intentional in the sample.
  One occurrence is not a convention.
- \`rule\` is one imperative sentence a reviewer can enforce.
- \`category\` is a short kebab-case slug naming the rule (e.g. "async-await-only").
- \`evidence_path\` is the exact path from a "### <path>" heading below.
- \`evidence_snippet\` is 1–10 lines copied VERBATIM from that file (no
  paraphrasing, no "..." elisions). It is verified against the file and the
  candidate is dropped if it does not match. Do not invent evidence.
- \`confidence\` (0–1) is how sure you are this is a deliberate house rule.

Prefer a handful of strong, specific candidates over many weak ones.`;

function fileSection(files: SampledFile[]): string {
  return files
    .map((f) => {
      const body =
        f.content.length > MAX_FILE_CHARS
          ? `${f.content.slice(0, MAX_FILE_CHARS)}\n… (truncated)`
          : f.content;
      return `### ${f.path}\n\`\`\`\n${body}\n\`\`\``;
    })
    .join('\n\n');
}

/** Builds the messages from the sampled config + source files. */
export function buildConventionsPrompt(sample: {
  configFiles: SampledFile[];
  sourceFiles: SampledFile[];
}): ChatMessage[] {
  const configSection = sample.configFiles.length
    ? fileSection(sample.configFiles)
    : '(no config files found)';
  const sourceSection = sample.sourceFiles.length
    ? fileSection(sample.sourceFiles)
    : '(no source files found)';
  return [
    { role: 'system', content: CONVENTIONS_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `## Config files\n\n${configSection}\n\n## Source files\n\n${sourceSection}`,
    },
  ];
}
