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

For a development API running directly on the host, start just the media services from the repository root:

```sh
docker compose --env-file .env -p gaza-dev-media -f compose.yaml -f infra/compose.media.dev.yaml up -d --build minio-init
```

Set `PRODUCT_MEDIA_ENDPOINT=http://127.0.0.1:9000` in the local development environment and restart the host API. The media port is published on loopback, and the bucket and restricted application identity are set up by the existing initializer. Use a single media endpoint for the development database and its images.
Compose uses the root `.env` for interpolation and explicitly passes each service its own settings. Configure `COMPOSE_RUNTIME_DATABASE_URL`, `COMPOSE_MIGRATION_DATABASE_URL`, and `COMPOSE_WORKER_DATABASE_URL` for separate database identities. Each container receives only its effective `DATABASE_URL`. The worker receives Twilio credentials and the API receives OTP and session signing keys. Both need the same `SMS_OUTBOX_KEY` when SMS is enabled. In production (`NODE_ENV=production`), set `CORS_ORIGIN` (comma-separated valid `http`/`https` URLs), strong 64+ character `DELIVERY_CODE_SECRET` / `JWT_SECRET` / `JWT_REFRESH_SECRET`, and optionally `PLATFORM_BANK_TRANSFER_PHONE` (`^0(?:59|56)\d{7}$`, default `0592229436`) plus the fee/commission variables (`PLATFORM_COMMISSION_BPS`, `PRO_COMMISSION_DISCOUNT_BPS`, `DELIVERY_PLATFORM_CUT_BPS`, `DRIVER_FEE_ILS`, `DELIVERY_BASE_FEE_ILS`, `DELIVERY_PER_KM_FEE_ILS`).

For backups and scheduled database maintenance:
- Run `bash infra/backup.sh` (optionally with `BACKUP_PASSPHRASE` set for AES-256-CBC `.enc` encryption) to dump MySQL (`--single-transaction`) and mirror MinIO `product-media` into timestamped archives with `RETENTION_DAYS` pruning.
- Run `docker compose --profile maintenance run --rm maintenance` (or install `infra/crontab.example`) to execute daily retention cleanup.

If the gateway returns 502 and logs `api-router could not be resolved` after an update, recreate the Compose services from the repository root. Starting old containers with `docker compose start` does not add the router or update the API and migrator images. After backing up an existing local database and pausing its writers, run:

```sh
docker compose -f compose.yaml -f compose.frontend.yaml up --build -d
curl -fsS http://127.0.0.1:5050/api/v1/ready
```

Include `--profile sms` before `up` if the local installation runs the SMS worker.

## Design decisions
- Redis shares the API request budget across routes and replicas for each client IP. The default is 300 requests per 60 seconds, configured by `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_TTL` (milliseconds). Login and registration share 5 requests per phone and 60 per IP per 15 minutes. OTP verification and resend share a separate budget of 5 per phone and 100 per IP per 15 minutes. Phone counter keys are keyed hashes. Session refresh allows 20 per IP per minute. These groups also count toward the general API budget. Health and readiness checks do not consume it. A blocked request returns 429 with `Retry-After` in seconds. During a rate-limit Redis outage, the catalog routes use a bounded per-process limit. Authentication, writes and other routes return 503.
- Nginx (`infra/nginx.conf`) trusts loopback/RFC1918 proxy hops via `set_real_ip_from` / `real_ip_header X-Forwarded-For` (`real_ip_recursive on`) and sets `X-Real-IP`, `X-Forwarded-For`, and `X-Request-ID`. A dedicated `^/api/[^/]+/orders/updates$` SSE location disables buffering/caching and uses `proxy_read_timeout 150s` (above the 120s server SSE lease) instead of the default 30s upstream timeout. The private HAProxy router (`infra/haproxy.cfg`) follows Docker DNS, uses least connections, excludes API replicas that fail `/api/v1/routing-ready`, and routes `/orders/updates` to `api_sse` (`timeout server 150s`, `timeout client 155s`). API containers wait up to `stop_grace_period: 35s` on shutdown. Keep direct access to the router and API private.
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
