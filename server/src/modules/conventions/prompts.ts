import type { ChatMessage } from '@devdigest/shared';

/**
 * System prompt for the Conventions Extractor's one LLM call. There is no
 * existing convention for a non-agent "feature" prompt (docs/agent-prompts/
 * only covers user-editable `agents.system_prompt`) — this establishes one as
 * a plain exported constant, following reviewer-core's inline-constant style
 * (e.g. `INJECTION_GUARD`) rather than inventing a DB-backed prompt for a
 * feature nobody edits.
 */
export const CONVENTIONS_SYSTEM_PROMPT = `You read a sample of a codebase's config files and top-ranked source files
and propose concrete, PROJECT-SPECIFIC coding conventions — not generic style
advice a linter would already say ("use consistent naming").

A good candidate is something a new contributor to THIS repo would not know
without reading the code: "routes return Result<T, ApiError>, never throw",
"Redis access goes through the lib/redis.ts singleton", "async/await only,
no .then() chains".

For each candidate, quote the EXACT snippet of code (verbatim, not
paraphrased) that shows the pattern — it will be verified against the file
you cite and dropped if it does not match. Do not invent evidence. Propose at
most a handful of the strongest, most specific candidates rather than many
weak ones.`;

/** Builds the user message from the sampled config + source files. */
export function buildConventionsPrompt(sample: {
  configFiles: Array<{ path: string; content: string }>;
  sourceFiles: Array<{ path: string; content: string }>;
}): ChatMessage[] {
  const configSection = sample.configFiles.length
    ? sample.configFiles
        .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
        .join('\n\n')
    : '(no config files found)';

  const sourceSection = sample.sourceFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  return [
    { role: 'system', content: CONVENTIONS_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `## Config files\n\n${configSection}\n\n## Top-ranked source files\n\n${sourceSection}`,
    },
  ];
}
