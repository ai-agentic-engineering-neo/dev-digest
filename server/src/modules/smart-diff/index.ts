/**
 * Public surface of the smart-diff module. Other modules reach it only
 * through here — never a direct import of its application/ports.ts
 * (server/INSIGHTS.md) — the same way skills exposes renderSkillBlock.
 */
export { classifyFile } from './domain/classify.js';
export { SMART_DIFF_ROLE_ORDER } from './domain/constants.js';
