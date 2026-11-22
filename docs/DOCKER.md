# Local infrastructure and scale boundaries

## Run
Docker Engine must be running. The existing .env has randomly generated Docker database passwords.

```sh
docker compose config --quiet
docker compose up --build -d --scale api=2
docker compose ps
docker compose logs --tail=100 api gateway

```

API entry point: http://localhost:5050/api/v1 . Only the gateway is published, on loopback.
Product media uses the private MinIO bucket `product-media` and the `minio-data` volume. In the root `.env`, set independent values for `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `PRODUCT_MEDIA_ACCESS_KEY`, and `PRODUCT_MEDIA_SECRET_KEY`. Compose provisions the bucket and a restricted API identity before starting the API. Include the media volume in backups. Owners upload one JPEG, PNG or WebP per product (up to 5 MiB). The API re-encodes images as WebP and serves them through the gateway.
MySQL and Redis have persistent volumes and no published ports. Do not use `down -v` unless intentionally deleting all data.
Migrations run once before API replicas start. Back up MySQL before migrations on existing data.
Docker overrides DATABASE_URL and REDIS_URL; local host settings do not connect to the private Docker services.
Compose uses the root `.env` for interpolation and explicitly passes each service its own settings. Configure `COMPOSE_RUNTIME_DATABASE_URL`, `COMPOSE_MIGRATION_DATABASE_URL`, and `COMPOSE_WORKER_DATABASE_URL` for separate database identities. Each container receives only its effective `DATABASE_URL`. The worker receives Twilio credentials and the API receives OTP and session signing keys. Both need the same `SMS_OUTBOX_KEY` when SMS is enabled.

If the gateway returns 502 and logs `api-router could not be resolved` after an update, recreate the Compose services from the repository root. Starting old containers with `docker compose start` does not add the router or update the API and migrator images. After backing up an existing local database and pausing its writers, run:

```sh
docker compose -f compose.yaml -f compose.frontend.yaml up --build -d
curl -fsS http://127.0.0.1:5050/api/v1/ready
```

Include `--profile sms` before `up` if the local installation runs the SMS worker.

## Design decisions
- Redis shares the API request budget across routes and replicas for each client IP. The default is 300 requests per 60 seconds, configured by `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_TTL` (milliseconds). Login and registration share 5 requests per phone and 60 per IP per 15 minutes. OTP verification and resend share a separate budget of 5 per phone and 100 per IP per 15 minutes. Phone counter keys are keyed hashes. Session refresh allows 20 per IP per minute. These groups also count toward the general API budget. Health and readiness checks do not consume it. A blocked request returns 429 with `Retry-After` in seconds. During a rate-limit Redis outage, the catalog routes use a bounded per-process limit. Authentication, writes and other routes return 503.
- Nginx sets the client IP and request ID headers. The private HAProxy router follows Docker DNS, uses least connections, and excludes API replicas that fail the database routing probe. HAProxy preserves the header from Nginx. Keep direct access to the router and API private.
- MySQL remains authoritative for users, OTP, tokens and future orders. OTP consumption is conditional; refresh rotation consumes and replaces the token within one transaction.
- Catalog caching is enabled for repeated public reads with a dedicated Redis instance. See `PERFORMANCE.md` for its TTL, invalidation and measured query budgets.
- A single Docker host is not high availability. Multiple replicas do not multiply database capacity; budget total connections across replicas. No claim of 100,000 concurrent users has been measured.

## External services
SMS cannot be delivered to mobile networks by Docker alone. Twilio offers a restricted trial, with verified recipients and destination restrictions. Check Palestinian number eligibility in the account before adopting it. https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account
The current SMS implementation is still a development logger, not a provider integration. Do not expose registration publicly with that implementation.

## Release gates still open
Orders, payments, drivers/delivery, real SMS, transactional OTP issuance/resend, integration tests, monitoring/alerting, backup restoration, TLS and deployment remain incomplete. The benchmark runner uses a separate Compose project. See `PERFORMANCE.md` for the measured workload and thresholds. Full CI must pass before any deployment pipeline is enabled. No external accounts or paid services are provisioned.

## Cost
Local containers require no hosted service subscription, but consume your hardware, disk and electricity. Public hosting and SMS are not guaranteed free. Docker Desktop licensing depends on the organization; Linux Docker Engine is an alternative. Never use free trials as a production availability guarantee.
