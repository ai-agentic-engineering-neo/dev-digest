import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildBundle, toPreviewFiles, type BuildBundleInput, type BundleSkill } from './bundle.js';
import { ValidationError } from '../../platform/errors.js';
import { RUNNER_DIR, MEMORY_PATH, skillFilePath, agentManifestPath, WORKFLOW_PATH } from './constants.js';

/**
 * specs/14-export-to-ci.md (P2, security-critical) — `buildBundle` is the
 * whole-bundle assembly point. These tests never touch a real filesystem for
 * the runner-bundle directory: `listRunnerBundleFiles`/`readFile` are
 * injected fakes, matching `bundle.ts`'s own stated purpose for those params.
 */

function sha256Hex(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

const FAKE_RUNNER_FILES: Record<string, string> = {
  'index.js': "console.log('runner');",
  'package.json': '{"type":"module"}',
};

function fakeRunnerDir(files: Record<string, string> = FAKE_RUNNER_FILES) {
  return {
    listRunnerBundleFiles: () => Object.keys(files),
    readFile: (path: string) => {
      const name = path.split('/').pop()!;
      const contents = files[name];
      if (contents === undefined) throw new Error(`no fake content for ${path}`);
      return contents;
    },
  };
}

function baseInput(overrides: Partial<BuildBundleInput> = {}): BuildBundleInput {
  return {
    target: 'gha',
    agent: {
      name: 'Security Reviewer',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'Review the diff for security issues.',
      strategy: 'auto',
      ciFailOn: 'critical',
    },
    skills: [],
    memory: [],
    triggers: ['opened', 'synchronize'],
    postAs: 'github_review',
    runnerBundleDir: '/fake/runner/dir',
    ...fakeRunnerDir(),
    ...overrides,
  };
}

describe('buildBundle', () => {
  it('AC-9 — is byte-identical across two calls with identical input (no clock, no randomness)', () => {
    const skills: BundleSkill[] = [
      { slug: 'no-secrets', body: '# No secrets\nDo not leak API keys.' },
      { slug: 'style-guide', body: '# Style\nUse const over let.' },
    ];
    const input = baseInput({ skills });
    const first = buildBundle(input);
    const second = buildBundle({ ...input, skills: [...skills] });
    expect(second).toEqual(first);
  });

  it('assembles one file per skill, sorted by slug, plus the workflow/manifest/memory files', () => {
    const skills: BundleSkill[] = [
      { slug: 'zeta-skill', body: 'zeta body' },
      { slug: 'alpha-skill', body: 'alpha body' },
    ];
    const files = buildBundle(baseInput({ skills }));

    const paths = files.map((f) => f.path);
    expect(paths).toContain(WORKFLOW_PATH);
    expect(paths).toContain(agentManifestPath());
    expect(paths).toContain(MEMORY_PATH);
    expect(paths).toContain(skillFilePath('alpha-skill'));
    expect(paths).toContain(skillFilePath('zeta-skill'));

    // Sorted by slug: alpha before zeta.
    expect(paths.indexOf(skillFilePath('alpha-skill'))).toBeLessThan(
      paths.indexOf(skillFilePath('zeta-skill')),
    );

    const alphaFile = files.find((f) => f.path === skillFilePath('alpha-skill'))!;
    expect(alphaFile.contents).toBe('alpha body');
    expect(alphaFile.editable).toBe(true);
  });

  it('the manifest file contents parse as YAML carrying the agent name', () => {
    const files = buildBundle(baseInput());
    const manifestFile = files.find((f) => f.path === agentManifestPath())!;
    expect(manifestFile.contents).toContain('Security Reviewer');
    expect(manifestFile.editable).toBe(true);
  });

  describe('P-2/P-4 — runner-bundle file list', () => {
    it('copies the ENTIRE runner-bundle directory wholesale, each file with a correct path/bytes/sha256, non-editable', () => {
      const files = buildBundle(baseInput());
      const runnerFiles = files.filter((f) => f.path.startsWith(`${RUNNER_DIR}/`));
      expect(runnerFiles).toHaveLength(Object.keys(FAKE_RUNNER_FILES).length);

      for (const [name, contents] of Object.entries(FAKE_RUNNER_FILES)) {
        const file = runnerFiles.find((f) => f.path === `${RUNNER_DIR}/${name}`);
        expect(file).toBeDefined();
        expect(file!.contents).toBe(contents);
        expect(file!.bytes).toBe(Buffer.byteLength(contents, 'utf8'));
        expect(file!.sha256).toBe(sha256Hex(contents));
        expect(file!.editable).toBe(false);
      }
    });

    it('lists runner-bundle files in stable sorted order, never raw directory-listing order', () => {
      const files = buildBundle(
        baseInput(fakeRunnerDir({ 'z-file.js': 'z', 'a-file.js': 'a', 'm-file.js': 'm' })),
      );
      const runnerPaths = files
        .filter((f) => f.path.startsWith(`${RUNNER_DIR}/`))
        .map((f) => f.path);
      expect(runnerPaths).toEqual([
        `${RUNNER_DIR}/a-file.js`,
        `${RUNNER_DIR}/m-file.js`,
        `${RUNNER_DIR}/z-file.js`,
      ]);
    });

    it('throws a stated, actionable ValidationError when the runner bundle directory is empty', () => {
      expect(() => buildBundle(baseInput({ listRunnerBundleFiles: () => [] }))).toThrow(ValidationError);
      expect(() => buildBundle(baseInput({ listRunnerBundleFiles: () => [] }))).toThrow(/pnpm --dir agent-runner build/);
    });

    it('throws a stated ValidationError when the runner bundle directory cannot be listed at all', () => {
      expect(() =>
        buildBundle(
          baseInput({
            listRunnerBundleFiles: () => {
              throw new Error('ENOENT');
            },
          }),
        ),
      ).toThrow(ValidationError);
    });
  });

  describe('AC-15/AC-55 — the known-secret-value scan', () => {
    it('flags a bundle whose generated content contains a KNOWN secret value verbatim', () => {
      // Deliberately NOT shape-matched by `containsSecretShapedValue` (no
      // sk-/ghp_/AKIA prefix, no "key:"/"token:"/"secret:" assignment) —
      // isolates the KNOWN-VALUE check from the shape-based one.
      const secret = 'zQ7mP9xR2vT4wL6yN8cB1dF3hK5jM0oS';
      const input = baseInput({
        skills: [{ slug: 'leaky', body: `The configured credential is ${secret}` }],
        knownSecretValues: [secret],
      });
      expect(() => buildBundle(input)).toThrow(ValidationError);
      expect(() => buildBundle(input)).toThrow(/known secret value/);
    });

    it('does NOT flag a bundle whose content never contains any of the known secret values', () => {
      const input = baseInput({
        skills: [{ slug: 'clean', body: 'Nothing sensitive here.' }],
        knownSecretValues: ['sk-not-present-at-all-1234567890'],
      });
      expect(() => buildBundle(input)).not.toThrow();
    });

    it('treats an undefined/blank known secret value as never matching (never a universal match)', () => {
      const input = baseInput({
        skills: [{ slug: 'clean', body: 'ordinary text' }],
        knownSecretValues: [undefined, '', '   '],
      });
      expect(() => buildBundle(input)).not.toThrow();
    });

    it('also rejects a shape-based secret (e.g. a raw OpenAI-style key) even with no known-value list', () => {
      const input = baseInput({
        skills: [{ slug: 'oops', body: 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' }],
      });
      expect(() => buildBundle(input)).toThrow(ValidationError);
    });
  });

  it('rejects an unregistered CI target before generating anything', () => {
    expect(() => buildBundle(baseInput({ target: 'circle' }))).toThrow(/No generator registered/);
  });
});

describe('toPreviewFiles', () => {
  it('nulls out ONLY the runner-bundle files’ contents, keeping bytes/sha256; leaves every other file’s contents intact', () => {
    const files = buildBundle(baseInput({ skills: [{ slug: 'a', body: 'a body' }] }));
    const preview = toPreviewFiles(files);

    for (const f of preview) {
      if (f.path.startsWith(`${RUNNER_DIR}/`)) {
        expect(f.contents).toBeNull();
      } else {
        const original = files.find((o) => o.path === f.path)!;
        expect(f.contents).toBe(original.contents);
      }
      // bytes/sha256 always survive, even when contents is nulled.
      const original = files.find((o) => o.path === f.path)!;
      expect(f.bytes).toBe(original.bytes);
      expect(f.sha256).toBe(original.sha256);
    }
  });

  it('never mutates the original CiFile array/objects', () => {
    const files = buildBundle(baseInput());
    const before = JSON.parse(JSON.stringify(files));
    toPreviewFiles(files);
    expect(files).toEqual(before);
  });
});
