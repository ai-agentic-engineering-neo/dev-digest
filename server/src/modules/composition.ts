import { buildAgentsModule } from './agents/composition.js';
import { buildConventionsModule } from './conventions/composition.js';
import { buildIntentModule } from './intent/composition.js';
import { buildPollingModule } from './polling/composition.js';
import { buildPullsModule } from './pulls/composition.js';
import { buildRepoIntelModule } from './repo-intel/composition.js';
import { buildReposModule } from './repos/composition.js';
import { buildReviewsModule } from './reviews/composition.js';
import { buildSettingsModule } from './settings/composition.js';
import { buildSkillsModule } from './skills/composition.js';
import { buildSmartDiffModule } from './smart-diff/composition.js';
import { buildWorkspaceModule } from './workspace/composition.js';

/**
 * Module factory registry (composition root). Each module owns its wiring in
 * `modules/<name>/composition.ts` → `build<Name>Module(container)`, returning
 * `{ service?, jobs?, ... }`. The Container builds each module lazily on first
 * access (`container.modules.<name>`) and registers every module's `jobs` at boot.
 *
 * ADD A MODULE: one line here + one line in ./index.ts (the route plugins).
 * The return type flows into `Container['modules']`, so changing what a
 * factory returns never requires editing platform/container.ts.
 */
export const moduleFactories = {
  settings: buildSettingsModule,
  repos: buildReposModule,
  pulls: buildPullsModule,
  polling: buildPollingModule,
  workspace: buildWorkspaceModule,
  agents: buildAgentsModule,
  reviews: buildReviewsModule,
  repoIntel: buildRepoIntelModule,
  skills: buildSkillsModule,
  conventions: buildConventionsModule,
  intent: buildIntentModule,
  smartDiff: buildSmartDiffModule,
};
