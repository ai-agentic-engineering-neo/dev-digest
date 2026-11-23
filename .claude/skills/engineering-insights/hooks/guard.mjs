#!/usr/bin/env node
// PreToolUse hook (Write|Edit|MultiEdit): INSIGHTS*.md are append-only.
//  - Write over an EXISTING insights file → deny (creating a new one, e.g. a domain split, is fine)
//  - Edit/MultiEdit → allowed only as pure insertion: new_string must contain old_string unchanged
// Removing or rewriting entries is a human job (review mode only proposes).
import fs from 'node:fs';
import path from 'node:path';
import { isInsightsPath, readStdinJson, PROJECT_DIR } from '../scripts/insights.mjs';

const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `INSIGHTS append-only: ${reason}. Add entries via node .claude/skills/engineering-insights/scripts/insights.mjs append <module> "<section>" "<entry>"; deletions/edits are done by a human.`,
    },
  }));
  process.exit(0);
};

try {
  const input = await readStdinJson();
  const ti = input.tool_input || {};
  const file = ti.file_path;
  if (isInsightsPath(file)) {
    const abs = path.resolve(input.cwd || PROJECT_DIR, file);
    if (input.tool_name === 'Write') {
      if (fs.existsSync(abs)) deny('Write would overwrite an existing file');
    } else if (input.tool_name === 'Edit') {
      if (!String(ti.new_string ?? '').includes(String(ti.old_string ?? ''))) deny('Edit changes or removes existing text');
    } else if (input.tool_name === 'MultiEdit') {
      const bad = (ti.edits || []).some((e) => !String(e.new_string ?? '').includes(String(e.old_string ?? '')));
      if (bad) deny('MultiEdit changes or removes existing text');
    }
  }
} catch {
  // ignore: fail open rather than block unrelated edits on a parsing error
}
process.exit(0);
