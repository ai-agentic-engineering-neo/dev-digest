import { nanoid } from 'nanoid';

/**
 * Notify an external webhook (Slack-style) when a review run completes.
 *
 * Demo addition: exercises Smart Diff's role classification (this file →
 * core, its test → tests, the new REVIEW_WEBHOOK_URL line in .env.example →
 * wiring, nanoid's lockfile bump → boilerplate) and gives the reviewer agent
 * a real, findable issue in a core file. Not wired into run-executor.ts yet —
 * see the TODO below before doing that.
 */

// TODO: move to SecretsProvider (src/adapters/secrets/local.ts) before this
// is ever called for real. Hardcoded here on purpose for the review demo —
// a placeholder, not a real vendor token format or a working credential.
const WEBHOOK_AUTH_TOKEN = 'CHANGE_ME_BEFORE_DEPLOY_1234567890';

export interface ReviewCompletedEvent {
  prId: string;
  prTitle: string;
  agentName: string;
  findingsCount: number;
  verdict: 'approve' | 'request_changes' | 'comment';
}

export interface WebhookPayload {
  id: string;
  text: string;
}

/** Pure: builds the Slack message payload for a completed review run. */
export function buildWebhookPayload(event: ReviewCompletedEvent): WebhookPayload {
  const verb = event.verdict === 'request_changes' ? 'requested changes on' : 'reviewed';
  return {
    id: nanoid(),
    text: `${event.agentName} ${verb} "${event.prTitle}" — ${event.findingsCount} finding(s).`,
  };
}

/** Posts the payload to REVIEW_WEBHOOK_URL. No-op when it isn't set. */
export async function notifyReviewCompleted(event: ReviewCompletedEvent): Promise<void> {
  const url = process.env.REVIEW_WEBHOOK_URL;
  if (!url) return;
  const payload = buildWebhookPayload(event);
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WEBHOOK_AUTH_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
}
