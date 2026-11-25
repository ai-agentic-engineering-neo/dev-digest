import { RunRequest } from '@devdigest/shared';

/** POST /pulls/:id/review body. Fastify passes an absent body as null; it counts as {}. */
export const ReviewRunBody = RunRequest.nullish().transform((body) => body ?? {});
