import { describe, it, expect } from 'vitest';
import { evidenceFilesFor, renderConventionsSkillBody } from '../src/modules/conventions/helpers.js';
import { buildConventionsPrompt } from '../src/modules/conventions/prompts.js';
import { MAX_FILE_CHARS } from '../src/modules/conventions/constants.js';

const ASYNC = {
  category: 'async-await-only',
  rule: 'Always use async/await instead of .then() chains.',
  evidence_path: 'src/api/users.ts',
  evidence_start_line: 23,
  evidence_end_line: 24,
  evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });',
};

describe('renderConventionsSkillBody', () => {
  it('renders title, intro and one section per candidate with citation + fenced snippet', () => {
    const body = renderConventionsSkillBody('payments-api-conventions', 'payments-api', [ASYNC]);
    expect(body).toBe(
      [
        '# payments-api-conventions',
        'House conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.',
        '## async-await-only',
        'Always use async/await instead of .then() chains.',
        'Detected in `src/api/users.ts:23-24`:\n```\nconst user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });\n```',
      ].join('\n\n'),
    );
  });

  it('uses a longer fence when the snippet contains backticks', () => {
    const body = renderConventionsSkillBody('x', 'r', [{ ...ASYNC, evidence_snippet: 'const s = ```;' }]);
    expect(body).toContain('````\nconst s = ```;\n````');
  });

  it('omits the citation when evidence is missing', () => {
    const body = renderConventionsSkillBody('x', 'r', [{ ...ASYNC, evidence_path: null }]);
    expect(body).not.toContain('Detected in');
  });
});

describe('evidenceFilesFor', () => {
  it('returns path:start-end for candidates with a full citation only', () => {
    expect(evidenceFilesFor([ASYNC, { ...ASYNC, evidence_start_line: null }])).toEqual(['src/api/users.ts:23-24']);
  });
});

describe('buildConventionsPrompt', () => {
  it('lists every file under its path heading and truncates oversized files', () => {
    const [system, user] = buildConventionsPrompt({
      configFiles: [],
      sourceFiles: [
        { path: 'src/a.ts', content: 'export const a = 1;' },
        { path: 'src/big.ts', content: 'x'.repeat(MAX_FILE_CHARS + 10) },
      ],
    });
    expect(system!.role).toBe('system');
    expect(user!.content).toContain('(no config files found)');
    expect(user!.content).toContain('### src/a.ts');
    expect(user!.content).toContain('… (truncated)');
  });
});
