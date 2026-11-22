// UserPromptSubmit hook: injects the relevant INSIGHTS.md files into context right after the user's prompt,
// so the agent reads them BEFORE working. Plain stdout (exit 0) is added to Claude's context.
// Never blocks, never throws: on any problem it prints nothing and exits 0.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const MAX_TOTAL = 9000; // docs: hook stdout is capped at 10,000 chars
const MODULES = {
  server: /\b(server|api|fastify|drizzle|migrat\w*|postgres|seed|route[sr]?|repo-intel|polling|db:\w+|sql)\b/i,
  client: /\b(client|next(\.js)?|react|ui|page|component\w*|tailwind|next-intl|i18n|frontend)\b/i,
  'reviewer-core': /\b(reviewer-core|grounding|llm|finding\w*|review engine|prompt\w*|structured output)\b/i,
  e2e: /\b(e2e|agent-browser|flow\.json|end-to-end)\b/i,
};

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }
  const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  const prompt = String(input.prompt || '');

  const picked = new Set();
  for (const [name, re] of Object.entries(MODULES)) {
    if (re.test(prompt) || prompt.includes(`${name}/`)) picked.add(name);
  }
  // the directory the session is working in also counts
  if (input.cwd) {
    const rel = relative(root, resolve(input.cwd)).split(sep)[0];
    if (rel in MODULES) picked.add(rel);
  }

  const files = ['INSIGHTS.md', ...[...picked].map((m) => join(m, 'INSIGHTS.md'))];
  const others = Object.keys(MODULES).filter((m) => !picked.has(m)).map((m) => `${m}/INSIGHTS.md`);

  let used = 0;
  const blocks = [];
  for (const f of files) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    let text = readFileSync(p, 'utf8').trim();
    const room = Math.max(0, MAX_TOTAL - used - 700);
    if (text.length > room) text = text.slice(0, room) + '\n…[обрізано — прочитай файл повністю]';
    used += text.length;
    blocks.push(`### ${f.split(sep).join('/')}\n${text}`);
  }
  if (!blocks.length) return;

  const head =
    '[engineering-insights] ПЕРЕД початком роботи врахуй нотатки нижче (глухі кути, повторні помилки, квірки, відкриті питання). ' +
    'Напиши користувачу ОДИН рядок: «Прочитав <файл> — враховую: <1-2 записи>» (або «нічого релевантного»). ' +
    'Наприкінці прокоментуй ті записи, на які спирався: якщо робота їх підтвердила в новому контексті, уточнила, спростувала чи розв’язала питання — ' +
    'додай під записом датований рядок «Update YYYY-MM-DD: …» (оригінал не видаляй). Нічого не змінилось — не коментуй. ' +
    `Якщо завдання зачіпає інший модуль, прочитай його файл сам: ${others.join(', ')}.`;
  process.stdout.write(`${head}\n\n${blocks.join('\n\n')}\n`);
}

try { main(); } catch { /* fail open */ }
process.exit(0);
