#!/usr/bin/env node
// PreToolUse hook: blocks Write/Edit on INSIGHTS*.md so entries can only be appended
// through append-insight.mjs (which never touches existing lines). Exit 2 = block.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const path = input?.tool_input?.file_path ?? '';
  if (/(^|\/)INSIGHTS(-[\w-]+)?\.md$/.test(path)) {
    console.error(
      `INSIGHTS files are append-only. Don't ${input.tool_name} ${path} directly — run:\n` +
      `node .claude/skills/engineering-insights/scripts/append-insight.mjs ${path} "<Section>" "- YYYY-MM-DD — <what> → <why> (<ref>)"`,
    );
    process.exit(2);
  }
  process.exit(0);
});
