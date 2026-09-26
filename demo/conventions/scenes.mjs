// Scenes for the Conventions Extractor demo (demo/conventions/scenario.md).
// Browser-only video on the author's repo Svyat90/dev-digest.
//
// Every scene's pre-roll (the code before `record`) puts the data into the exact state
// that scene starts from, through the API — so any scene can be re-shot on its own.

// FILMING order — not playback order. The video is concatenated in `config.order`.
export const order = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'];
export const browser = order;

const API = 'http://localhost:3001';
const REPO_ID = '562ddc32-33fe-4292-8ec5-83cc6bb2e528';
const AGENT_ID = '6f6e2eb2-b04c-4e37-8ed7-52f34bf52ccf'; // General Reviewer
const PR_ID = 'a9d5aafe-d461-411f-bd89-0dff359f67d9';    // PR #7
const SKILL_NAME = 'repo-conventions';

// The candidates of scan 4340df92 as they were before any take.
const C = {
  strict: '1306d0b0-dffa-466b-a1f2-12a63f54f30f',
  module: '0f329217-5693-460e-a972-c6334920da26',
  schemaOrg: '322ae770-ca84-4904-bca7-6953ca2c260b',
  apiClient: '9331d3ba-6514-4f06-b6b0-0f96346e196b',
  rq: 'dbf08b2e-34e8-4333-b7dd-1e4a63ac9d27',
  styles: '2d2596ed-2ffa-4c89-8178-6d7f537d582b',
  constants: '2e3bda2e-3b77-4414-8738-9832fe4f881f',
  schemaTables: 'bbad0a88-efd0-43d2-b2f1-a7a846d45e38',
  header: 'c0b72066-312f-43a5-acfa-e779bb779a23',
  aliases: 'f12778f4-9974-4dff-a05a-4e771f8a1ad8',
};
const HEADER_RULE_ORIGINAL = 'Every source file must start with a `/* ... */` comment describing its purpose and scope.';
const HEADER_RULE_EDITED = 'Every module in client/src/lib starts with a /* … */ header comment describing its purpose.';
const SKILL_NOTE = 'Cite the rule name in every finding.';

async function api(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && r.status !== 404) throw new Error(`${method} ${path}: HTTP ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// ---------- data states, one per point in the story ----------
async function candidates({ accepted = [], rejected = [], headerEdited = false }) {
  for (const id of Object.values(C)) {
    const status = rejected.includes(id) ? 'rejected' : accepted.includes(id) ? 'accepted' : 'pending';
    const patch = { status };
    if (id === C.header) patch.rule = headerEdited ? HEADER_RULE_EDITED : HEADER_RULE_ORIGINAL;
    await api('PATCH', `/conventions/${id}`, patch);
  }
}
const BASELINE = { accepted: [C.aliases] };
const AFTER_S4 = { accepted: [C.aliases, C.strict, C.module, C.apiClient, C.header], headerEdited: true };
const AFTER_S5 = { ...AFTER_S4, rejected: [C.constants] };

async function findSkill() {
  const list = await api('GET', '/skills');
  return (list ?? []).find(s => s.name === SKILL_NAME) ?? null;
}
async function deleteSkill() {
  const s = await findSkill();
  if (s) await api('DELETE', `/skills/${s.id}`);
}
async function ensureSkill() {
  const existing = await findSkill();
  if (existing) return existing;
  const pv = await api('POST', `/repos/${REPO_ID}/conventions/skill/preview`);
  return api('POST', `/repos/${REPO_ID}/conventions/skill`, {
    name: SKILL_NAME, description: pv.description, type: pv.type, enabled: true,
    body: `${pv.body.trimEnd()}\n\n${SKILL_NOTE}`,
  });
}
async function linkSkill(on) {
  const skill = on ? await ensureSkill() : null;
  await api('PUT', `/agents/${AGENT_ID}/skills`, { items: skill ? [{ skill_id: skill.id, enabled: true }] : [] });
}
async function deleteRuns() {
  for (const r of (await api('GET', `/pulls/${PR_ID}/runs`)) ?? []) await api('DELETE', `/runs/${r.run_id}`);
}
async function waitRunDone(timeoutMs = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const runs = (await api('GET', `/pulls/${PR_ID}/runs`)) ?? [];
    const run = runs.find(r => r.agent_id === AGENT_ID);
    if (run && run.status === 'done') return run;
    if (run && ['failed', 'cancelled', 'error'].includes(run.status)) throw new Error(`run ${run.run_id} ${run.status}`);
    await new Promise(res => setTimeout(res, 2000));
  }
  throw new Error('run on PR #7 did not finish in time');
}

export default function scenes(stage) {
  const { sleep, record, stop, cue, shot, web, config, dry } = stage;
  const p = () => web.page;
  const base = config.web.baseUrl;
  const conventionsUrl = `${base}/repos/${REPO_ID}/conventions`;

  // Off-path pages (/settings, /skills, /agents, /) take the sidebar repo from
  // localStorage["dd-repo"]; visiting /repos/:id does NOT write it (lib/repo-context.tsx),
  // so a fresh profile would show the first seeded repo. Pin it explicitly.
  async function pinRepo() {
    await web.open(base);
    await p().evaluate(id => localStorage.setItem('dd-repo', id), REPO_ID);
  }

  // A Feature Models row: the label, and the clickable model picker under it.
  function modelRow(label) {
    const row = p().locator('label', { hasText: new RegExp(`^${label}`) }).locator('xpath=ancestor::div[2]');
    return { row, picker: row.locator('div[style*="cursor:pointer"]').first() };
  }

  // A convention card, found by the start of its rule text (header row → card).
  const card = ruleStart => p().getByText(ruleStart).first().locator('xpath=ancestor::div[2]');

  // All candidates of one scan share created_at and the list is ordered only by it, so
  // Postgres may return them in a new order after every PATCH. Never trust a position:
  // wait for the refetch to land, re-find the card by its text, centre it, then act.
  async function settle() {
    await p().waitForLoadState('networkidle');
    await sleep(350);
  }
  async function focusCard(ruleStart) {
    await settle();
    const c = card(ruleStart);
    await web.scrollIntoCenter(c);
    await sleep(250);
    return c;
  }
  async function acceptCard(ruleStart) {
    const c = await focusCard(ruleStart);
    await web.clickOn(c.getByRole('button', { name: 'Accept as Skill' }), 650);
    await card(ruleStart).getByText('Accepted', { exact: true }).waitFor();
  }

  async function openConventions() {
    await web.open(conventionsUrl);
    await p().getByRole('heading', { name: /Conventions in Svyat90\/dev-digest/ }).waitFor();
  }

  // Smoothly scroll the scrollable box that holds `text` so that line sits near its top.
  async function scrollBoxTo(text) {
    return p().evaluate(async needle => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode()) && !node.textContent.includes(needle)) {}
      if (!node) return null;
      let box = node.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight + 10 && getComputedStyle(box).overflowY !== 'visible')) box = box.parentElement;
      const range = document.createRange();
      const i = node.textContent.indexOf(needle);
      range.setStart(node, i); range.setEnd(node, i + needle.length);
      if (box) {
        // The stage sets CSS zoom on <html>: rects come back zoomed, scrollTop does not.
        const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        const top = (range.getBoundingClientRect().top - box.getBoundingClientRect().top) / zoom;
        box.scrollTo({ top: box.scrollTop + top - 12, behavior: 'smooth' });
        await new Promise(r => setTimeout(r, 900));
      }
      return true;
    }, text);
  }

  async function openTrace() {
    await web.open(`${base}/repos/${REPO_ID}/pulls/7`);
    await p().getByRole('button', { name: /Agent runs/ }).click();
    await p().getByRole('button', { name: 'Open run trace & logs' }).first().waitFor();
  }

  return {
    async s1() {
      await pinRepo();
      await web.open(`${base}/settings/models`);
      await p().getByRole('heading', { name: 'Feature Models' }).waitFor();
      const conv = modelRow('Conventions');
      await web.glide(900, 300, 10);
      await record('s1');
      await cue('s1-01', async ms => {
        await web.glideTo(p().getByRole('heading', { name: 'Feature Models' }), 1400);
        await sleep(ms * 0.35);
        await web.glideTo(conv.row.locator('label'), 1400);
      });
      await cue('s1-02', async ms => {
        await web.glideTo(conv.picker, 1000);
        if (dry) shot('dry-s1-picker');
        await sleep(ms * 0.5);
        await web.glideTo(p().getByText('Extracts coding conventions from the repo.'), 900);
      });
      await sleep(800);
      if (dry) shot('dry-s1-end');
      await stop();
    },

    async s2() {
      await pinRepo();
      await deleteRuns();
      await linkSkill(false);
      await deleteSkill();
      await candidates(BASELINE);
      await openConventions();
      await web.glide(900, 400, 10);
      await record('s2');
      await cue('s2-01', async ms => {
        await web.glideTo(p().getByRole('button', { name: 'Re-scan' }), 1400);
        if (dry) shot('dry-s2-rescan');
      });
      await cue('s2-02', async () => {
        await web.glideTo(p().getByText(/Detected from 17 sample files/), 1400);
      });
      await cue('s2-03', async ms => {
        const first = await focusCard('Every tsconfig must enable');
        await web.glideTo(first.getByText('TypeScript strictness'), 1200);
        await sleep(ms * 0.35);
        await web.glideTo(first.getByText(/Every tsconfig must enable/), 1200);
      });
      await sleep(600);
      if (dry) shot('dry-s2-end');
      await stop();
    },

    async s3() {
      await candidates(BASELINE);
      await openConventions();
      const first = await focusCard('Every tsconfig must enable');
      await web.glideTo(first.getByText(/Every tsconfig must enable/), 10);
      await record('s3');
      await cue('s3-01', async ms => {
        await web.glideTo(first.getByRole('link', { name: /Detected in client\/tsconfig.json:6-7/ }), 1200);
        await sleep(ms * 0.45);
        await web.glideTo(first.locator('pre'), 1200);
      });
      await cue('s3-02', async ms => {
        await sleep(ms * 0.35);
        await web.glideTo(first.getByText('Confidence', { exact: true }), 1200);
        if (dry) shot('dry-s3-confidence');
      });
      await sleep(600);
      await stop();
    },

    async s4() {
      await candidates(BASELINE);
      await openConventions();
      const first = await focusCard('Every tsconfig must enable');
      await web.glideTo(first.getByText(/Every tsconfig/), 10);
      await record('s4');
      await cue('s4-01', async ms => {
        await sleep(ms * 0.2);
        await acceptCard('Every tsconfig must enable');
        await acceptCard('All tsconfigs must use');
        await acceptCard('All API calls must use');
        if (dry) shot('dry-s4-accepted');
      });
      await cue('s4-02', async ms => {
        const hdr = await focusCard('Every source file must start');
        await web.glideTo(hdr.getByText(/Every source file must start/), 900);
        await sleep(ms * 0.3);
        await web.clickOn(hdr.getByRole('button', { name: 'Edit' }), 700);
        const rule = p().getByPlaceholder('Rule');
        await web.clickOn(rule, 500);
        await p().keyboard.press('Meta+A');
        await p().keyboard.type(HEADER_RULE_EDITED, { delay: 28 });
        if (dry) shot('dry-s4-editing');
      });
      await cue('s4-03', async ms => {
        await web.clickOn(p().getByRole('button', { name: 'Save' }), 600);
        await card('Every module in client/src/lib').waitFor();
        await sleep(ms * 0.2);
        await acceptCard('Every module in client/src/lib');
        await web.glide(web.pos[0], web.pos[1] - 60, 400);
        if (dry) shot('dry-s4-end');
      });
      await sleep(800);
      await stop();
    },

    async s5() {
      await candidates(AFTER_S4);
      await openConventions();
      const cst = await focusCard('Constants must be grouped');
      await web.glideTo(cst.getByText(/Constants must be grouped/), 10);
      await record('s5');
      await cue('s5-01', async ms => {
        await sleep(ms * 0.45);
        await web.clickOn(cst.getByRole('button', { name: 'Reject' }), 800);
      });
      await cue('s5-02', async ms => {
        await web.scrollBy('main', -4000);
        await web.glideTo(p().getByText('5 of 9 accepted'), 900);
        await sleep(ms * 0.35);
        await openConventions();
        await web.glideTo(p().getByText('5 of 9 accepted'), 700);
        if (dry) shot('dry-s5-reloaded');
      });
      await sleep(800);
      await stop();
    },

    async s6() {
      await candidates(AFTER_S5);
      await linkSkill(false);
      await deleteSkill();
      await openConventions();
      await web.glide(1200, 400, 10);
      await record('s6');
      await cue('s6-01', async ms => {
        await web.clickOn(p().getByRole('button', { name: 'Create skill' }), 900);
        const dlg = p().getByRole('dialog');
        await dlg.waitFor();
        await sleep(ms * 0.2);
        await web.glideTo(dlg.getByText(/Merged from/), 900);
        await sleep(ms * 0.15);
        await web.glideTo(dlg.getByRole('textbox').first(), 900);
        if (dry) shot('dry-s6-modal');
      });
      await cue('s6-02', async ms => {
        const dlg = p().getByRole('dialog');
        const body = dlg.locator('textarea');
        await web.clickOn(body, 800);
        await p().keyboard.press('Meta+ArrowDown');
        await p().keyboard.type(`\n\n${SKILL_NOTE}`, { delay: 35 });
        await sleep(ms * 0.15);
        if (dry) shot('dry-s6-typed');
        await web.clickOn(dlg.getByRole('button', { name: 'Create' }), 800);
        await p().getByText(`Skill "${SKILL_NAME}" created`).waitFor();
      });
      await sleep(1500);
      if (dry) shot('dry-s6-toast');
      await stop();
    },

    async s7() {
      await candidates(AFTER_S5);
      await ensureSkill();
      await linkSkill(false);
      await web.open(`${base}/skills`);
      const skillCard = p().getByText(SKILL_NAME, { exact: true }).first();
      await skillCard.waitFor();
      await web.scrollIntoCenter(skillCard);
      await web.glide(700, 300, 10);
      await record('s7');
      await cue('s7-01', async ms => {
        await web.glideTo(skillCard, 1100);
        await sleep(ms * 0.3);
        await web.glideTo(skillCard.locator('xpath=ancestor::div[3]').getByText(/Extracted/).first(), 900);
        if (dry) shot('dry-s7-card');
      });
      await sleep(600);
      await stop();
    },

    async s8() {
      await ensureSkill();
      await linkSkill(false);
      await web.open(`${base}/agents/${AGENT_ID}`);
      await p().getByRole('button', { name: 'Skills', exact: true }).click();
      await p().getByPlaceholder('Filter skills…').waitFor();
      await web.prep();
      await web.glide(1000, 300, 10);
      await record('s8');
      await cue('s8-01', async ms => {
        const filter = p().getByPlaceholder('Filter skills…');
        await web.clickOn(filter, 900);
        await p().keyboard.type('repo', { delay: 120 });
        await sleep(ms * 0.2);
        const row = p().getByText(SKILL_NAME, { exact: true }).locator('xpath=..');
        await web.clickOn(row.getByRole('checkbox'), 900);
        if (dry) shot('dry-s8-linked');
      });
      await cue('s8-02', async () => {
        await web.glideTo(p().getByText(/1 of \d+ enabled/), 1000);
      });
      await sleep(600);
      await stop();
    },

    async s9() {
      await ensureSkill();
      await linkSkill(true);
      await deleteRuns();
      await pinRepo();
      // The list defaults to "Needs review", and PR #7 stays `reviewed` after an earlier
      // take even once its runs are deleted — open the All filter (?status=all) up front.
      await web.open(`${base}/repos/${REPO_ID}/pulls?status=all`);
      const pr = p().getByText(/move workspace overview/).first();
      await pr.waitFor();
      await web.glideTo(p().getByRole('button', { name: 'All', exact: true }), 10);
      await record('s9');
      await cue('s9-01', async ms => {
        await sleep(ms * 0.15);
        await web.clickOn(pr, 700);
        const runBtn = p().getByRole('button', { name: /Run Review/ });
        await runBtn.waitFor();
        await web.prep();
        await web.clickOn(runBtn, 600);
        const item = p().getByText('General Reviewer', { exact: true }).last();
        await item.waitFor();
        if (dry) shot('dry-s9-menu');
        await web.clickOn(item, 600);
      });
      await sleep(1500);
      await stop();
    },

    async s10() {
      await waitRunDone();
      await openTrace();
      await web.glide(1000, 400, 10);
      await record('s10');
      await cue('s10-01', async ms => {
        await web.clickOn(p().getByRole('button', { name: 'Open run trace & logs' }).first(), 800);
        const section = p().getByText('Prompt assembly', { exact: true });
        await section.waitFor();
        await web.scrollIntoCenter(section);
        await web.clickOn(section, 700);
      });
      await cue('s10-02', async ms => {
        const label = p().getByText('Skills (dynamic)', { exact: true });
        await label.waitFor();
        await web.scrollIntoStart(label);
        await web.glideTo(label, 900);
        await sleep(ms * 0.3);
        await web.glideTo(p().getByText(/tokens · repo-conventions/), 900);
        if (dry) shot('dry-s10-skills');
      });
      await cue('s10-03', async ms => {
        await web.clickOn(p().getByText('Skills (dynamic)', { exact: true }), 700);
        await sleep(ms * 0.15);
        await scrollBoxTo('File header comments');
        if (dry) shot('dry-s10-expanded');
      });
      await sleep(600);
      await stop();
    },

    async s11() {
      await openTrace();
      await p().getByRole('button', { name: 'Open run trace & logs' }).first().click();
      const section = p().getByText('Prompt assembly', { exact: true });
      await section.waitFor();
      await section.scrollIntoViewIfNeeded();
      await section.click();
      const label = p().getByText('Skills (dynamic)', { exact: true });
      await label.waitFor();
      await label.click();
      await web.prep();
      await web.scrollIntoStart(label);
      await web.glideTo(label, 10);
      await record('s11');
      await scrollBoxTo('File header comments');
      await cue('s11-01', async ms => {
        await sleep(ms * 0.3);
        await web.wheel(240, 40, 180);
      });
      await sleep(1200);
      if (dry) shot('dry-s11-end');
      await stop();
    },
  };
}
