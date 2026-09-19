// scripts/check-claude-md.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, findClaudeMd, relativeLinks, contentLines } from './claude-md-lib.mjs';

const ROOT_FILE_BUDGET = 45;
const MODULE_BUDGET = 60;
const REQUIRED_LINKS = ['README.md', 'docs/README.md', 'specs/README.md', 'INSIGHTS.md'];
const READ_WHEN = /\bread\b[^\n]*\b(when|before)\b/i;
const READ_WHEN_MSG = 'has no "Read ... when/before ..." pointer';

export function check(repoRoot) {
  const v = [];
  const rel = (p) => relative(repoRoot, p);
  const checkLinks = (file, md) => {
    for (const l of relativeLinks(md)) {
      if (!existsSync(resolve(dirname(file), l))) v.push(`${rel(file)}: broken link ${l}`);
    }
  };

  const rootFile = join(repoRoot, 'CLAUDE.md');
  if (!existsSync(rootFile)) v.push('CLAUDE.md: missing at repo root');
  else {
    const md = readFileSync(rootFile, 'utf8');
    checkLinks(rootFile, md);
    for (const m of MODULES) {
      if (!md.includes(`${m}/CLAUDE.md`)) v.push(`CLAUDE.md: does not link ${m}/CLAUDE.md`);
    }
    if (!READ_WHEN.test(md)) v.push(`CLAUDE.md: ${READ_WHEN_MSG}`);
    const n = contentLines(md);
    if (n > ROOT_FILE_BUDGET) v.push(`CLAUDE.md: ${n} lines > ${ROOT_FILE_BUDGET}`);
  }

  const allowed = new Set([rootFile, ...MODULES.map((m) => join(repoRoot, m, 'CLAUDE.md'))]);

  for (const m of MODULES) {
    const modDir = join(repoRoot, m);
    for (const f of ['README.md', 'INSIGHTS.md', 'docs/README.md', 'specs/README.md']) {
      const p = join(modDir, f);
      if (!existsSync(p)) v.push(`${m}/${f}: missing`);
      else checkLinks(p, readFileSync(p, 'utf8'));
    }

    const file = join(modDir, 'CLAUDE.md');
    if (!existsSync(file)) v.push(`${m}/CLAUDE.md: missing`);
    else {
      const md = readFileSync(file, 'utf8');
      checkLinks(file, md);
      const links = new Set(relativeLinks(md));
      for (const need of REQUIRED_LINKS) {
        if (!links.has(need)) v.push(`${m}/CLAUDE.md: does not link ${need}`);
      }
      if (!READ_WHEN.test(md)) v.push(`${m}/CLAUDE.md: ${READ_WHEN_MSG}`);
      const n = contentLines(md);
      if (n > MODULE_BUDGET) v.push(`${m}/CLAUDE.md: ${n} lines > ${MODULE_BUDGET}`);
    }

    for (const f of findClaudeMd(modDir)) {
      if (!allowed.has(f)) {
        v.push(`${rel(f)}: stray CLAUDE.md (only the repo root and module roots may have one)`);
      }
    }
  }
  return v;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const v = check(repoRoot);
  if (v.length) { console.error(v.join('\n') + `\n\n${v.length} violation(s)`); process.exit(1); }
  console.log('CLAUDE.md structure OK');
}
