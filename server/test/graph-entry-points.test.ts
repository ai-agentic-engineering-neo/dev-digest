import { describe, expect, it } from 'vitest';
import { classifyEntryPoint, isTestFile } from '../src/modules/repo-intel/graph/entry-points.js';

const none = { endpoints: [], crons: [] };

describe('isTestFile (AC-27a)', () => {
  it.each(['a/b.test.ts', 'a/b.spec.tsx', 'src/__tests__/x.ts', '__tests__/y.js', 'a.test.mjs'])('%s is a test', (p) => {
    expect(isTestFile(p)).toBe(true);
  });
  it.each(['src/test-utils.ts', 'src/contest.ts', 'src/testing/x.ts', 'src/spec.ts'])('%s is not a test', (p) => {
    expect(isTestFile(p)).toBe(false);
  });
});

describe('classifyEntryPoint (AC-27a)', () => {
  it('file_facts endpoints win, then crons', () => {
    expect(classifyEntryPoint('src/r.ts', { endpoints: ['GET /users', 'POST /users'], crons: ['0 * * * *'] })).toEqual({ type: 'endpoint', label: 'GET /users' });
    expect(classifyEntryPoint('src/j.ts', { endpoints: [], crons: ['0 * * * *'] })).toEqual({ type: 'cron', label: 'cron 0 * * * *' });
  });

  it('app-router page / route / layout files, at any depth under app/', () => {
    expect(classifyEntryPoint('app/page.tsx', none)?.type).toBe('page');
    expect(classifyEntryPoint('client/src/app/repos/[id]/layout.tsx', none)?.type).toBe('layout');
    expect(classifyEntryPoint('src/app/api/x/route.ts', undefined)?.type).toBe('route');
  });

  it('is not fooled by look-alikes', () => {
    expect(classifyEntryPoint('src/pages/page.tsx', none)).toBeNull();
    expect(classifyEntryPoint('app/pagehelper.tsx', none)).toBeNull();
    expect(classifyEntryPoint('app/x/page.helper.ts', none)).toBeNull();
    expect(classifyEntryPoint('src/util.ts', none)).toBeNull();
  });

  it('a test file is never an entry point, even with facts or an app-router name', () => {
    expect(classifyEntryPoint('app/x/route.test.ts', { endpoints: ['GET /x'], crons: [] })).toBeNull();
    expect(classifyEntryPoint('src/__tests__/page.tsx', none)).toBeNull();
  });
});
