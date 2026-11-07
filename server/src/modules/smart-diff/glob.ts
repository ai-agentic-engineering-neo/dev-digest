const cache = new Map<string, RegExp>();

const REGEX_META = /[.+?^${}()|[\]\\]/;

function compile(pattern: string): RegExp {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const atSegmentStart = i === 0 || pattern[i - 1] === '/';
    if (atSegmentStart && pattern.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
    } else if (pattern.startsWith('/**', i) && i + 3 === pattern.length) {
      out += '/.*';
      i += 3;
    } else {
      const ch = pattern[i] as string;
      if (ch === '*') out += '[^/]*';
      else if (REGEX_META.test(ch)) out += '\\' + ch;
      else out += ch;
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

/** Case-sensitive glob: `*` = any chars except `/`; leading `**` + slash = zero or more dirs; trailing `/**` = anything below. */
export function matchesGlob(path: string, pattern: string): boolean {
  let re = cache.get(pattern);
  if (!re) {
    re = compile(pattern);
    cache.set(pattern, re);
  }
  return re.test(path);
}
