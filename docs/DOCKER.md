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
MySQL and Redis have persistent volumes and no published ports. Do not use `down -v` unless intentionally deleting all data.
Migrations run once before API replicas start. Back up MySQL before migrations on existing data.
Docker overrides DATABASE_URL and REDIS_URL; local host settings do not connect to the private Docker services.

## Design decisions
- Redis is required for shared request limits across replicas. Atomic Lua increments use millisecond expiry; Redis outages fail closed with 503. No local fallback weakens limits. Redis is private and uses noeviction, so cache entries cannot evict security counters.
- Nginx distributes requests across API replicas using Docker DNS and least connections. It overwrites forwarded client IP headers. TRUST_PROXY=1 is safe only with private API access through this gateway.
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
