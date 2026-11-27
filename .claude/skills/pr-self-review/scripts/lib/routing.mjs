// Pure routing: changed files × skill-map.json → review buckets.
import path from 'node:path';

const escapeRe = (s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&');

/** Minimal glob → RegExp: `**`, `*`, `?`, `{a,b}` (literal alternatives). */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; ) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) throw new Error(`unclosed { in glob: ${glob}`);
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')';
      i = end + 1;
    } else {
      re += escapeRe(c);
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}

const cache = new Map();
export function matchesAny(file, globs = []) {
  return globs.some((g) => {
    if (!cache.has(g)) cache.set(g, globToRegExp(g));
    return cache.get(g).test(file);
  });
}

/**
 * @param files manifest.files entries ({ path, deleted, binary, changed_lines })
 * @param map   parsed skill-map.json; a skill's optional `contains` (strings) further requires the
 *              file content to include at least one of them (e.g. zod → files importing zod)
 * @param contentOf (file) → string|null, used only for `contains`
 * @returns { buckets: [{ id, skill, files, changed_lines }], excluded, unmapped, skipped }
 */
export function routeFiles(files, map, contentOf = () => null) {
  const reviewable = [];
  const skipped = [];
  const excluded = [];
  for (const f of files) {
    if (f.deleted || f.binary) skipped.push(f.path);
    else if (matchesAny(f.path, map.global_exclude)) excluded.push(f.path);
    else reviewable.push(f);
  }

  const bySkill = new Map();
  const mapped = new Set();
  for (const [skill, def] of Object.entries(map.skills)) {
    const hit = reviewable.filter((f) => {
      if (!matchesAny(f.path, def.include) || matchesAny(f.path, def.exclude)) return false;
      if (!def.contains?.length) return true;
      const text = contentOf(f.path);
      return text !== null && def.contains.some((s) => text.includes(s));
    });
    if (hit.length === 0) continue;
    hit.forEach((f) => mapped.add(f.path));
    bySkill.set(skill, hit);
  }

  const buckets = [];
  for (const [skill, hit] of bySkill) {
    const chunks = splitBucket(hit, map.max_bucket_lines ?? 1500);
    chunks.forEach((chunk, i) => {
      buckets.push({
        id: chunks.length === 1 ? skill : `${skill}--${i + 1}`,
        skill,
        files: chunk.map((f) => f.path),
        changed_lines: chunk.reduce((n, f) => n + f.changed_lines, 0),
      });
    });
  }
  const unmapped = reviewable.map((f) => f.path).filter((p) => !mapped.has(p));
  return { buckets, excluded, unmapped, skipped };
}

/** Packs files into chunks of ≤ max changed lines, keeping a directory together where possible. */
export function splitBucket(files, max) {
  const total = files.reduce((n, f) => n + f.changed_lines, 0);
  if (total <= max) return [files];
  const byDir = new Map();
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const d = path.posix.dirname(f.path);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }
  const chunks = [];
  let cur = [];
  let curLines = 0;
  const flush = () => {
    if (cur.length) chunks.push(cur);
    cur = [];
    curLines = 0;
  };
  for (const group of byDir.values()) {
    for (const f of group) {
      if (curLines > 0 && curLines + f.changed_lines > max) flush();
      cur.push(f);
      curLines += f.changed_lines;
    }
  }
  flush();
  return chunks;
}
