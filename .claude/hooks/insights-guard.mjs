// PreToolUse hook: INSIGHTS.md files are APPEND-ONLY for the agent. Blocks (exit 2) any Write / Edit / shell command
// that would delete or alter existing text in INSIGHTS.md or INSIGHTS-archive.md. Pure insertions are allowed.
//   Write : allowed if the file does not exist yet, or every existing line is still present, in order, in the new content.
//   Edit  : allowed only if every non-empty line of old_string is still present, in order, in new_string.
//   Shell : best-effort block of overwrite/delete patterns (`>`, sed -i, rm, mv, truncate, tee w/o -a, Set-Content, ...).
// Italic placeholder lines (_..._) from the template may be replaced by real entries.
// Escape hatch for a deliberate human-approved consolidation: create the file .claude/hooks/ALLOW_INSIGHTS_REWRITE
// (delete it afterwards). Fails open on unexpected errors so it can never wedge a session.
import { readFileSync, existsSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';

const TARGET = /^INSIGHTS(-archive)?\.md$/;
const isPlaceholder = (l) => /^_.*_$/.test(l.trim());
const lines = (s) => String(s).replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');

// are all of `need` present in `have`, in order (insertions allowed)? returns first missing line or null
function firstMissing(need, have) {
  let i = 0;
  for (const n of need) {
    while (i < have.length && have[i] !== n) i++;
    if (i >= have.length) return n;
    i++;
  }
  return null;
}

function deny(msg) {
  process.stderr.write(
    `[engineering-insights guard] Заблоковано: ${msg}\n` +
      'INSIGHTS.md — лише для дописування. Додавай нові записи вставкою (Edit, де new_string містить old_string повністю) ' +
      'або `Update YYYY-MM-DD:` під записом; не перезаписуй і не видаляй наявний текст. ' +
      'Не обходь блок іншим інструментом — запитай користувача. (Свідома консолідація: користувач створює .claude/hooks/ALLOW_INSIGHTS_REWRITE.)\n',
  );
  process.exit(2);
}

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  if (existsSync(join(root, '.claude', 'hooks', 'ALLOW_INSIGHTS_REWRITE'))) return;

  const tool = input.tool_name;
  const ti = input.tool_input || {};

  if (tool === 'Write' || tool === 'Edit') {
    const fp = String(ti.file_path || '');
    if (!TARGET.test(basename(fp.replace(/\\/g, '/')))) return;
    if (!existsSync(fp)) return; // creating a new file is fine
    const current = readFileSync(fp, 'utf8');
    if (tool === 'Write') {
      const missing = firstMissing(lines(current).filter((l) => !isPlaceholder(l)), lines(ti.content));
      if (missing !== null) deny(`Write перезаписав би файл і втратив рядок: «${missing.slice(0, 120)}». Використай Edit-вставку.`);
    } else {
      const missing = firstMissing(lines(ti.old_string).filter((l) => !isPlaceholder(l)), lines(ti.new_string));
      if (missing !== null) deny(`Edit змінює/видаляє наявний рядок: «${missing.slice(0, 120)}». new_string має містити old_string цілком.`);
    }
    return;
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(ti.command || '');
    if (!/INSIGHTS(-archive)?\.md/.test(cmd)) return;
    const destructive = [
      /(^|[^>&0-9])>\s*["']?[^\s"'|&;]*INSIGHTS(-archive)?\.md/, // overwrite redirect (not >>)
      /\bsed\b[^|;&]*\s-i/,
      /\bperl\b[^|;&]*\s-[a-z]*i/,
      /\b(rm|mv|truncate|shred|unlink)\b/,
      /\btee\b(?![^|;&]*\s-a)/,
      /\b(Set-Content|Out-File|Clear-Content|Remove-Item|Move-Item|Rename-Item)\b/i,
    ];
    if (destructive.some((re) => re.test(cmd))) {
      deny('команда може перезаписати/видалити INSIGHTS.md. Для дописування використовуй Edit-вставку або `>>`.');
    }
  }
}

try { main(); } catch { /* fail open */ }
process.exit(0);
