# devdigest-experiments

Tiny Fastify orders API used as the base repository for the DevDigest skills
experiments (API Contract Reviewer and Test Quality Reviewer).

- `GET /v1/orders/:id` returns `{ id, total, currency }` (`total` in cents).
- API version is tracked in `package.json`, `openapi.yaml` (`info.version`) and
  `CHANGELOG.md`.
- Tests: `npm install && npm test`.
