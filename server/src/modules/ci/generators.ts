import type { CiExportInput, CiFile, CiTarget } from '@devdigest/shared/contracts/eval-ci';
import {
  AGENTS_DIR,
  MEMORY_PATH,
  RESULT_ARTIFACT_NAME,
  SKILLS_DIR,
  WORKFLOW_PATH,
} from './constants.js';
import { slugify } from './helpers.js';

/** Agent shape consumed by the file generators. */
export interface GeneratorAgent {
  name: string;
  slug: string;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: string;
  ciFailOn: string;
  skills: { name: string; body: string }[];
}

/** Build the full set of files added by an export. */
export function generateFiles(input: CiExportInput, agent: GeneratorAgent): CiFile[] {
  const files: CiFile[] = [];

  files.push({
    path: WORKFLOW_PATH,
    contents: workflowYaml(input, agent.slug),
    editable: true,
  });

  files.push({
    path: `${AGENTS_DIR}/${agent.slug}.yaml`,
    contents: agentYaml(agent),
    editable: true,
  });

  for (const s of agent.skills) {
    files.push({
      path: `${SKILLS_DIR}/${slugify(s.name)}.md`,
      contents: `# ${s.name}\n\n${s.body}\n`,
      editable: true,
    });
  }

  files.push({
    path: MEMORY_PATH,
    contents: '',
    editable: true,
  });

  return files;
}

/** Build the GitHub Actions workflow YAML (or a CLI stub for non-GHA targets). */
export function workflowYaml(input: CiExportInput, slug: string): string {
  if (input.target !== 'gha') {
    // non-GHA targets get a CLI-style stub; GHA is the supported path.
    return [
      '# DevDigest CI (generic) — runs the devdigest CLI on each PR',
      'steps:',
      '  - run: npx devdigest review --pr "$PR_NUMBER" --agent ' + slug,
      '',
    ].join('\n');
  }
  const types = input.triggers.map((x) => x).join(', ');
  // The action posts a github-review (or nothing); pr_comment maps to a review
  // for now (a dedicated comment mode lands later).
  const postMode = input.post_as === 'none' ? 'none' : 'github-review';
  return [
    'name: DevDigest Review',
    'on:',
    '  pull_request:',
    `    types: [${types}]`,
    '',
    '# Same-repo branch PRs get secrets + a writable token; external-fork PRs',
    '# do not (the post step is then skipped). See the DevDigest fork model.',
    'permissions:',
    '  contents: read',
    '  pull-requests: write',
    '',
    'jobs:',
    '  review:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: ./agent-runner',
    '        with:',
    `          agent: ${slug}`,
    `          post: ${postMode}`,
    '        env:',
    '          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}',
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '      - uses: actions/upload-artifact@v4',
    '        if: always()',
    '        with:',
    `          name: ${RESULT_ARTIFACT_NAME}`,
    '          path: devdigest-result.json',
    '          if-no-files-found: ignore',
    '',
  ].join('\n');
}

/** Build the agent manifest YAML. */
export function agentYaml(agent: {
  name: string;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: string;
  ciFailOn: string;
  skills: { name: string }[];
}): string {
  return [
    `name: ${agent.name}`,
    `provider: ${agent.provider}`,
    `model: ${agent.model}`,
    `strategy: ${agent.strategy}`,
    // CI gate: when this agent's review should block (REQUEST_CHANGES + fail
    // the check) vs just comment. Acted on ONLY by the GitHub Action runner.
    `ci_fail_on: ${agent.ciFailOn}`,
    'system_prompt: |',
    ...agent.systemPrompt.split('\n').map((l) => `  ${l}`),
    'skills:',
    ...agent.skills.map((s) => `  - ${slugify(s.name)}`),
    '',
  ].join('\n');
}

/** Build the PR description body for the export PR. */
export function prBody(agentName: string, target: CiTarget, files: CiFile[]): string {
  const list = files.map((f) => `- \`${f.path}\``).join('\n');
  return [
    `This PR wires up **DevDigest** to review pull requests automatically using the **${agentName}** agent (${target}).`,
    '',
    '**Files added:**',
    list,
    '',
    'Add `OPENROUTER_API_KEY` to the repo Actions secrets before the workflow runs. `GITHUB_TOKEN` is auto-provided.',
    '',
    '_Opened via DevDigest Export-to-CI._',
  ].join('\n');
}
