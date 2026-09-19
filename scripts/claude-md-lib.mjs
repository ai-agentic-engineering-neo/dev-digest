// scripts/claude-md-lib.mjs
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MODULES = ['server', 'client', 'reviewer-core', 'e2e'];

const EXCLUDED = new Set(['node_modules', 'dist', '.next', 'clones', 'coverage']);

export const isExcluded = (name) => EXCLUDED.has(name) || name.startsWith('.');

export function findClaudeMd(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!isExcluded(e.name)) walk(join(d, e.name));
      } else if (e.name === 'CLAUDE.md') {
        out.push(join(d, e.name));
      }
    }
  };
  walk(dir);
  return out.sort();
}

export function relativeLinks(markdown) {
  const links = [];
  for (const m of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const t = m[1];
    if (/^(https?:|mailto:|#)/.test(t)) continue;
    links.push(t.split('#')[0]);
  }
  return links;
}

export const contentLines = (md) => md.split('\n').filter((l) => l.trim()).length;
