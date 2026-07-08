import { describe, expect, it } from 'vitest';
import {
  CI_RESULT_ARTIFACT_NAME,
  CI_RESULT_FILE_NAME,
  CI_TARGET_FILE_PATHS,
  FORBIDDEN_TRIGGER_EVENTS,
  FORK_GATE_CONDITION,
  GHA_WORKFLOW_PATH,
  RUNNER_ENTRY_PATH,
} from './constants.js';
import { buildCiConfigFiles, buildGhaWorkflowFile, buildGhaWorkflowYaml } from './workflow.js';

/** Extract the block of trimmed, non-empty lines under a top-level `key:` header, up to the next top-level (non-indented) key. */
function extractBlock(yamlText: string, header: string): string[] {
  const lines = yamlText.split('\n');
  const startIndex = lines.findIndex((line) => line === header);
  if (startIndex === -1) return [];
  const block: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.length > 0 && !line.startsWith(' ')) break; // next top-level key
    if (line.trim().length > 0) block.push(line.trim());
  }
  return block;
}

describe('buildGhaWorkflowYaml — security invariants', () => {
  it('permissions block is EXACTLY contents:read + pull-requests:write, nothing broader (AC-15)', () => {
    const yamlText = buildGhaWorkflowYaml();
    const block = extractBlock(yamlText, 'permissions:');
    expect(block).toEqual(['contents: read', 'pull-requests: write']);
  });

  it('references the OpenRouter key ONLY via secrets.OPENROUTER_API_KEY — no literal anywhere (AC-16)', () => {
    const yamlText = buildGhaWorkflowYaml();
    expect(yamlText).toContain('${{ secrets.OPENROUTER_API_KEY }}');

    const keyLine = yamlText.split('\n').find((line) => line.includes('OPENROUTER_API_KEY:'));
    expect(keyLine).toBeDefined();
    expect(keyLine).toContain('${{ secrets.OPENROUTER_API_KEY }}');

    // No quoted literal value anywhere near the key name (defends against a
    // literal being pasted in alongside/instead of the secrets.* reference).
    expect(yamlText).not.toMatch(/OPENROUTER_API_KEY:\s*['"][^$]/);
    // GitHub's own auto-injected token must also never be a literal.
    const tokenLine = yamlText
      .split('\n')
      .find((line) => line.trim().startsWith('GITHUB_TOKEN:'));
    expect(tokenLine).toContain('${{ secrets.GITHUB_TOKEN }}');
  });

  it('uses pull_request (never pull_request_target) and gates the job on head.repo.fork == false (AC-17)', () => {
    const yamlText = buildGhaWorkflowYaml();
    expect(yamlText).toContain('pull_request:');
    expect(yamlText).not.toContain('pull_request_target');
    expect(yamlText).toContain('if: github.event.pull_request.head.repo.fork == false');
  });

  it('on: is limited to the configured pull_request events, never comment triggers (AC-18)', () => {
    const yamlText = buildGhaWorkflowYaml({ triggers: ['opened', 'synchronize'] });
    const typesLine = yamlText.split('\n').find((line) => line.trim().startsWith('types:'));
    expect(typesLine).toBeDefined();
    expect(typesLine).toContain('opened');
    expect(typesLine).toContain('synchronize');
    expect(typesLine).not.toContain('reopened');

    for (const forbidden of FORBIDDEN_TRIGGER_EVENTS) {
      expect(yamlText).not.toContain(forbidden);
    }
    expect(yamlText).not.toContain('issue_comment');
    expect(yamlText).not.toContain('pull_request_review_comment');
  });

  it('silently drops unknown/forbidden requested triggers and falls back to defaults if none remain valid (defense-in-depth for AC-18)', () => {
    const yamlText = buildGhaWorkflowYaml({
      triggers: ['issue_comment', 'pull_request_review_comment'],
    });
    const typesLine = yamlText.split('\n').find((line) => line.trim().startsWith('types:'));
    expect(typesLine).not.toContain('issue_comment');
    expect(typesLine).not.toContain('pull_request_review_comment');
    // Nothing valid was requested, so the default trigger set is used instead.
    expect(typesLine).toContain('opened');
  });

  it('review step invokes the bundled runner directly — no marketplace uses: action for review (AC-19)', () => {
    const yamlText = buildGhaWorkflowYaml();
    expect(yamlText).toContain(`run: node ${RUNNER_ENTRY_PATH}`);
    expect(yamlText).not.toContain('devdigest/review-action@v1');
    expect(yamlText).not.toContain('uses: devdigest/review-action@v1');
  });

  it('default GHA workflow path is .github/workflows/devdigest-review.yml (AC-4)', () => {
    const file = buildGhaWorkflowFile();
    expect(file.path).toBe('.github/workflows/devdigest-review.yml');
    expect(file.path).toBe(GHA_WORKFLOW_PATH);
    expect(file.contents).toBe(buildGhaWorkflowYaml());
  });

  it('uploads the result artifact under the shared name, from within the same fork-gated job, even on failure (AC-27)', () => {
    const yamlText = buildGhaWorkflowYaml();
    const lines = yamlText.split('\n');

    // The upload step must sit after the fork-gate `if:` line — i.e. inside
    // the same keyed `review` job — never as a separate, ungated job.
    const forkGateIndex = lines.findIndex((line) => line.trim() === `if: ${FORK_GATE_CONDITION}`);
    const uploadStepIndex = lines.findIndex((line) =>
      line.trim().startsWith('- name: Upload review result artifact'),
    );
    expect(forkGateIndex).toBeGreaterThan(-1);
    expect(uploadStepIndex).toBeGreaterThan(forkGateIndex);

    // Runs even after a REQUEST_CHANGES (non-zero exit) run, so failed runs
    // still upload a result for the pull-based ingest to retrieve.
    const uploadStepBlock = lines.slice(uploadStepIndex, uploadStepIndex + 6).join('\n');
    expect(uploadStepBlock).toContain('if: always()');
    expect(uploadStepBlock).toContain('uses: actions/upload-artifact@v4');
    expect(uploadStepBlock).toContain(`name: ${CI_RESULT_ARTIFACT_NAME}`);
    expect(uploadStepBlock).toContain(`path: ${CI_RESULT_FILE_NAME}`);
    expect(CI_RESULT_FILE_NAME).toBe('devdigest-result.json');
  });

  it('forwards post_as into DEVDIGEST_POST_AS and defaults to github_review when unset (AC-24)', () => {
    const defaultYaml = buildGhaWorkflowYaml();
    const defaultLine = defaultYaml.split('\n').find((line) => line.trim().startsWith('DEVDIGEST_POST_AS:'));
    expect(defaultLine).toContain('DEVDIGEST_POST_AS: github_review');

    const prCommentYaml = buildGhaWorkflowYaml({ postAs: 'pr_comment' });
    const prCommentLine = prCommentYaml
      .split('\n')
      .find((line) => line.trim().startsWith('DEVDIGEST_POST_AS:'));
    expect(prCommentLine).toContain('DEVDIGEST_POST_AS: pr_comment');

    const noneYaml = buildGhaWorkflowYaml({ postAs: 'none' });
    const noneLine = noneYaml.split('\n').find((line) => line.trim().startsWith('DEVDIGEST_POST_AS:'));
    expect(noneLine).toContain('DEVDIGEST_POST_AS: none');
  });

  it('silently drops an unrecognized post_as and falls back to github_review (defense-in-depth for AC-24)', () => {
    const yamlText = buildGhaWorkflowYaml({ postAs: 'send-to-slack' });
    const line = yamlText.split('\n').find((line) => line.trim().startsWith('DEVDIGEST_POST_AS:'));
    expect(line).toContain('DEVDIGEST_POST_AS: github_review');
  });
});

describe('buildCiConfigFiles — non-GHA targets emit a single downloadable file, no PR wiring', () => {
  it('gha target returns exactly the workflow file at the default path', () => {
    const files = buildCiConfigFiles('gha');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe(GHA_WORKFLOW_PATH);
  });

  it('circle target returns exactly one config file, no secret literal, invokes the bundled runner', () => {
    const files = buildCiConfigFiles('circle');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe(CI_TARGET_FILE_PATHS.circle);
    expect(files[0]?.contents).toContain(`node ${RUNNER_ENTRY_PATH}`);
    expect(files[0]?.contents).not.toMatch(/OPENROUTER_API_KEY\s*[:=]\s*['"]sk-/);
  });

  it('jenkins target returns exactly one Jenkinsfile, no secret literal, invokes the bundled runner', () => {
    const files = buildCiConfigFiles('jenkins');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe(CI_TARGET_FILE_PATHS.jenkins);
    expect(files[0]?.contents).toContain(`node ${RUNNER_ENTRY_PATH}`);
    expect(files[0]?.contents).not.toMatch(/OPENROUTER_API_KEY\s*[:=]\s*['"]sk-/);
  });

  it('cli target returns exactly one script, no secret literal, invokes the bundled runner', () => {
    const files = buildCiConfigFiles('cli');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe(CI_TARGET_FILE_PATHS.cli);
    expect(files[0]?.contents).toContain(`node ${RUNNER_ENTRY_PATH}`);
    expect(files[0]?.contents).not.toMatch(/OPENROUTER_API_KEY\s*[:=]\s*['"]sk-/);
  });
});
