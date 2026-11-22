// Stop hook: once per session, if the working tree has code changes, ask the agent to run the
// engineering-insights wrap-up (write ONLY significant, new findings; otherwise write nothing).
// Stop fires after EVERY assistant turn, so this is gated: (1) skip when stop_hook_active, (2) skip when
// there are no code changes, (3) remind at most once per session_id (state file in the OS temp dir).
// Never throws: on any problem it exits 0 and lets the agent stop.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  if (input.stop_hook_active) return; // already continuing because of a stop hook

  const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  const sid = String(input.session_id || 'unknown').replace(/[^\w-]/g, '_');
  const state = join(tmpdir(), `devdigest-insights-${sid}.json`);
  if (existsSync(state)) return; // already reminded in this session

  let status = '';
  try {
    status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return; } // not a git repo / git missing

  const codeChanges = status
    .split('\n')
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
    .filter((p) => !/(^|\/)INSIGHTS(-archive)?\.md$/.test(p) && !p.startsWith('.claude/'));
  if (!codeChanges.length) return;

  try { writeFileSync(state, JSON.stringify({ reminded: Date.now(), n: codeChanges.length })); } catch { return; }

  const reason =
    'Перед завершенням: виконай підсумковий прохід skill `engineering-insights`. ' +
    'Перечитай INSIGHTS.md модуля(ів), де йшла робота. (1) Запиши ЛИШЕ суттєве й нове (глухий кут, повторна помилка + фікс, ' +
    'квірк залежності, незадокументована конвенція, відкрите питання), без дублів. ' +
    '(2) Прокоментуй наявні записи, на які спирався: підтверджено в новому контексті / уточнено / спростовано / питання розв’язано — ' +
    'датований рядок «Update YYYY-MM-DD: …» під записом, оригінал не видаляй. ' +
    'Якщо нічого суттєвого немає й коментувати нічого — нічого не пиши і просто заверши без пояснень.';
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

try { main(); } catch { /* fail open */ }
process.exit(0);
