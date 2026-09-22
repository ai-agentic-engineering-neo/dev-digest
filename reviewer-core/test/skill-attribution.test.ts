import { describe, it, expect } from 'vitest';
import type { Finding, Review } from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import { StubLLM } from './fixtures/llm.js';
import { configDiff, twoFileDiff } from './fixtures/diff.js';
import { groundFindings, reduceReviews, reviewPullRequest } from '../src/index.js';

/**
 * Skill attribution (server/specs/03-skills.md Rules §10): the engine never
 * reads `Finding.skill`, but it must carry it unchanged through structured
 * parsing, the map-reduce reduce step and citation grounding — the server
 * resolves it to findings.skill_id afterwards.
 */
function finding(id: string, skill: string | null | undefined, line = 11, file = 'src/config.ts'): Finding {
  return {
    id,
    severity: 'WARNING',
    category: 'security',
    title: `finding ${id}`,
    file,
    start_line: line,
    end_line: line,
    rationale: 'r',
    confidence: 0.8,
    kind: 'finding',
    ...(skill !== undefined ? { skill } : {}),
  };
}

const review = (findings: Finding[]): Review => ({ verdict: 'comment', summary: 's', score: 80, findings });

describe('Finding.skill survives the engine', () => {
  it('the Review schema keeps `skill` and still accepts findings without it', () => {
    const parsed = ReviewSchema.parse(review([finding('a', 'no-then-chains'), finding('b', undefined)]));
    expect(parsed.findings.map((f) => f.skill)).toEqual(['no-then-chains', undefined]);
  });

  it('reduceReviews keeps each partial finding’s skill', () => {
    const merged = reduceReviews([review([finding('a', 'rubric-a')]), review([finding('b', null)])]);
    expect(merged.findings.map((f) => [f.id, f.skill])).toEqual([
      ['a', 'rubric-a'],
      ['b', null],
    ]);
  });

  it('groundFindings keeps `skill` on kept findings', () => {
    const { kept, dropped } = groundFindings([finding('ok', 'gate'), finding('gone', 'gate', 999)], configDiff());
    expect(kept.map((f) => [f.id, f.skill])).toEqual([['ok', 'gate']]);
    expect(dropped.map((d) => d.finding.skill)).toEqual(['gate']);
  });

  it('reviewPullRequest (map-reduce): skill survives parse → reduce → grounding', async () => {
    const llm = new StubLLM({
      respond: (req) => {
        const user = req.messages[1]!.content;
        return user.includes('+++ b/src/other.ts')
          ? review([finding('o', 'second-skill', 11, 'src/other.ts')])
          : review([finding('c', 'first-skill'), finding('x', 'first-skill', 999)]);
      },
    });
    const outcome = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: twoFileDiff(),
      llm,
      strategy: 'map-reduce',
      concurrency: 1,
      skills: ['### first-skill\n\nA', '### second-skill\n\nB'],
    });
    expect(outcome.mode).toBe('map-reduce');
    expect(outcome.review.findings.map((f) => [f.id, f.skill])).toEqual([
      ['c', 'first-skill'],
      ['o', 'second-skill'],
    ]);
    // Both chunks carried the skills section.
    expect(llm.calls.every((c) => c.messages[1]!.content.includes('## Skills / rules\n### first-skill'))).toBe(true);
  });
});
