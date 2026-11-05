/**
 * Tiny YAML-frontmatter reader for skill markdown (`---\nkey: value\n---`).
 * Handles what skill files actually use: scalar `key: value` (optionally
 * quoted) and folded/literal block scalars (`key: >` / `key: |`). Anything
 * more exotic is kept as raw text — values are only ever displayed / used as
 * plain strings, never evaluated.
 */

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

const FM_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseFrontmatter(text: string): Frontmatter {
  const m = FM_RE.exec(text);
  if (!m) return { data: {}, body: text };

  const data: Record<string, string> = {};
  const lines = m[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!;
    const rest = kv[2]!.trim();
    if (rest === '>' || rest === '>-' || rest === '|' || rest === '|-' || rest === '') {
      // block scalar (or nested map/list): consume indented continuation lines
      const block: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!;
        if (next.trim() !== '' && !/^\s/.test(next)) break;
        block.push(next.trim());
        i++;
      }
      const folded = rest.startsWith('>') || rest === '';
      data[key] = (folded ? block.join(' ') : block.join('\n')).trim();
    } else {
      data[key] = unquote(rest);
    }
  }
  return { data, body: text.slice(m[0].length) };
}
