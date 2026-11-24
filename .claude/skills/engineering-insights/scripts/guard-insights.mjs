// PreToolUse guard: INSIGHTS.md files are append-only.
// Blocks (exit 2) a Write over an existing INSIGHTS.md and any Edit that would remove text.
import fs from 'node:fs';
import path from 'node:path';

let raw = '';
process.stdin.on('data', (c) => (raw += c)).on('end', () => {
  const { cwd = '.', tool_name, tool_input = {} } = JSON.parse(raw || '{}');
  const file = tool_input.file_path || '';
  if (!file.endsWith('INSIGHTS.md')) process.exit(0);

  if (tool_name === 'Write' && fs.existsSync(path.resolve(cwd, file))) {
    console.error(`${file} is append-only: do not overwrite it. Use Edit with old_string = a section heading and new_string = that heading + the new entry.`);
    process.exit(2);
  }
  if (tool_name === 'Edit' && !String(tool_input.new_string ?? '').includes(String(tool_input.old_string ?? ''))) {
    console.error(`${file} is append-only: this Edit would remove or change existing text. new_string must contain old_string unchanged.`);
    process.exit(2);
  }
  process.exit(0);
});
