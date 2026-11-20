#!/usr/bin/env node
// Stop hook: after a chunk of real work (new file edits since the last wrap-up),
// make the agent run the engineering-insights wrap-up once. Questions and
// no-edit turns pass through. Silent on any error.
import fs from 'node:fs';
import {
  routePaths, isInsightsPath, loadState, saveState, readStdinJson,
} from '../scripts/insights.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** File paths of every edit tool call in the transcript (JSONL). */
export function editedPaths(transcriptPath) {
  const paths = [];
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type !== 'tool_use' || !EDIT_TOOLS.has(c.name)) continue;
      const p = c.input?.file_path || c.input?.notebook_path;
      if (p && !isInsightsPath(p)) paths.push(p);
    }
  }
  return paths;
}

try {
  const input = await readStdinJson();
  if (input.stop_hook_active) process.exit(0);
  if (!input.transcript_path || !fs.existsSync(input.transcript_path)) process.exit(0);

  const paths = editedPaths(input.transcript_path);
  const state = loadState(input.session_id);
  if (paths.length <= state.wrapupEdits) process.exit(0);

  const newPaths = paths.slice(state.wrapupEdits);
  const modules = routePaths(newPaths);
  state.wrapupEdits = paths.length;
  saveState(input.session_id, state);
  if (modules.length === 0) process.exit(0); // edits outside the project (plans, scratchpad)

  const reason = [
    `engineering-insights wrap-up (changed: ${modules.join(', ')}).`,
    '0) Reflect: what was non-obvious in this chunk of work? Generalize it into a rule, not a description of the patch.',
    `1) Read the INSIGHTS.md of these modules and check for duplicates: node .claude/skills/engineering-insights/scripts/insights.mjs grep <module> <keywords>.`,
    '2) Pick ≤5 candidates that pass the quality gate in SKILL.md (non-obvious, recurring, cold-actionable, saves ≥5 min, has evidence, not a duplicate).',
    '3) Write ONLY via insights.mjs append <module> "<section>" "<entry>". Nothing passed → say "No new insights" in one line and write nothing.',
  ].join('\n');
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
} catch {
  // ignore: never trap the agent in a broken hook
}
process.exit(0);
