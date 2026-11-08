#!/usr/bin/env node
// PreToolUse hook for the `implementation-planner` subagent: allow Write only to <project>/plans/*.md.
// Input: hook JSON on stdin (tool_input.file_path). Exit 2 = block, stderr goes back to the agent.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // unparsable input: don't break the session, the prompt rule still applies
}

const file = input?.tool_input?.file_path;
if (!file) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const plansDir = norm(path.join(root, 'plans')) + '/';
const target = norm(path.isAbsolute(file) ? file : path.join(input.cwd || root, file));

if (target.startsWith(plansDir) && target.endsWith('.md') && !target.slice(plansDir.length).includes('/')) {
  process.exit(0);
}

console.error(`Blocked: implementation-planner may write only plans/*.md (got ${file}) — no specs, no code. Put the content into the plan; a spec problem → return CANNOT PLAN → run spec-creator.`);
process.exit(2);
