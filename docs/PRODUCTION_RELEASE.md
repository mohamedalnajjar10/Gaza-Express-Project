# Production release gates

## What to prepare on the target environment

1. Create a staging host and a separate production host or account. Set HTTPS for the API and frontend. Restrict direct access to MySQL, Redis and NestJS. The Docker Compose gateway is bound to loopback and is suitable behind a trusted TLS proxy. Verify forwarded-IP settings against the real proxy chain.
2. Provision a runtime MySQL user and a separate migration user for each database. Provide runtime secrets through the platform secret store. The local Compose database account is shared by its API and migrator, so configure separate credentials for a live deployment. Start from `apps/api/.env.production.example`. Keep production secrets distinct from local and staging secrets.
3. Provide an image registry and deployment identity scoped to staging. Run the CI workflow on a pushed branch and capture the passing build. Publish and deploy the tested API and migrator images by digest. Production promotion should require the exact tested image digest and a deployment approval.
4. Configure a supported real SMS provider and verify a code arrives on an authorized test number. Configure WhatsApp Business and independently validate a posted bank transfer in the bank account. Confirm how much cash the driver hands over, the payout rules and the refund policy with operations. Connect an electronic provider only after the merchant account, supported currencies and settlement arrangements are confirmed.

## Gate a release

- Take a consistent encrypted database backup and record the restore point. Restore it into a separate database and verify critical row counts, an order and its payment ledger, and the new application reads. Record restore time and data loss against the required RTO and RPO.
- Run the migrator once with migration credentials. Deploy API and worker images. Check `/api/v1/health` and `/api/v1/ready`, then exercise signup, login, checkout, confirmation, delivery and settlement with test identities. Keep the previous image available. Check migration compatibility before any image rollback.
- Run a deployment rehearsal on staging, including a dependency interruption. A readiness failure returns HTTP 503 and liveness remains independent. Configure the live orchestrator or load balancer to use readiness for routing. Compose health status alone does not remove a backend from Nginx.
- Collect latency, errors, MySQL saturation, Redis memory, queue age and failed or uncertain SMS deliveries. Set ownership for alerts. Run the load profiles with production-like data and request mix. Record p95/p99, throughput and failure rates. The local run in `PERFORMANCE.md` is the baseline.

## Google frontend integration

`GOOGLE_AUTH_ENABLED` defaults to disabled. Keep it disabled until browser testing is complete. Register the exact callback URL with Google and configure frontend and API on the same site over HTTPS in production. The callback verifies state and redirects to `/auth/success` without an access token in the URL. The success page must send `POST /api/v1/auth/google/exchange` to the API with `credentials: 'include'` from the configured frontend origin. The handoff expires after 60 seconds and is consumed once. Existing local accounts with the same email must sign in using their existing method. Account linking requires a separate authenticated flow.

## Store operations

A store owner creates a pending store. An admin lists pending stores at `GET /api/v1/stores/moderation` and sends `PATCH /api/v1/stores/:id/moderation` with `expectedStatus`, `status` and a `reason`. The application records the actor and transition in the same transaction and invalidates the catalog cache. When a store has moderation history, archive it via status instead of hard-deleting it.
