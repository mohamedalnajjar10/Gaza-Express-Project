#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
project="wasla-ci-$(openssl rand -hex 6)"
env_file=$(mktemp)
compose=(docker compose --env-file "$env_file" -p "$project" -f compose.yaml -f compose.frontend.yaml)
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans --rmi local || true
  rm -f -- "$env_file"
}
trap cleanup EXIT

export GATEWAY_PORT=15050 DOCKER_DB_NAME=wasla_smoke_test API_REPLICAS=2
export WASLA_WEB_IMAGE="$project-web" WASLA_MINIO_IMAGE="$project-minio"
export NODE_ENV=production API_PREFIX=api/v1 SMS_PROVIDER=disabled
export CORS_ORIGIN="http://127.0.0.1:${GATEWAY_PORT}"
export GOOGLE_AUTH_ENABLED=false WEB_BANK_TRANSFER_ENABLED=false VITE_GOOGLE_MAPS_API_KEY=
export JWT_SECRET="$(openssl rand -hex 48)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
export DELIVERY_CODE_SECRET="$(openssl rand -hex 48)"
export DOCKER_DB_PASSWORD="$(openssl rand -hex 24)"
export DOCKER_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
export PRODUCT_MEDIA_ACCESS_KEY="$(openssl rand -hex 12)"
export PRODUCT_MEDIA_SECRET_KEY="$(openssl rand -hex 24)"
export MINIO_ROOT_USER="$(openssl rand -hex 12)"
export MINIO_ROOT_PASSWORD="$(openssl rand -hex 24)"
unset COMPOSE_RUNTIME_DATABASE_URL COMPOSE_MIGRATION_DATABASE_URL COMPOSE_WORKER_DATABASE_URL
unset COMPOSE_CATALOG_CACHE_URL COMPOSE_RATE_REDIS_URL
unset BANK_TRANSFER_INSTRUCTIONS WHATSAPP_PHONE_NUMBER_ID WHATSAPP_APP_SECRET WHATSAPP_VERIFY_TOKEN
unset JWT_EXPIRES_IN JWT_REFRESH_EXPIRES_IN RATE_LIMIT_TTL RATE_LIMIT_MAX_REQUESTS

COMPOSE_RUNTIME_DATABASE_URL=mysql://api-fixture@mysql/fixture \
COMPOSE_WORKER_DATABASE_URL=mysql://worker-fixture@mysql/fixture \
COMPOSE_MIGRATION_DATABASE_URL=mysql://migrator-fixture@mysql/fixture \
  "${compose[@]}" --profile sms config --format json | node -e '
    const { services } = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const expected = { api: "api-fixture", "sms-worker": "worker-fixture", migrate: "migrator-fixture" };
    for (const [name, databaseUser] of Object.entries(expected)) {
      const env = services[name].environment;
      if (env.DATABASE_URL !== `mysql://${databaseUser}@mysql/fixture`) throw new Error(`Incorrect database identity for ${name}`);
      if (Object.keys(env).some(key => /^(?:COMPOSE_.*DATABASE_URL|MIGRATION_DATABASE_URL|DOCKER_DB_(?:ROOT_)?PASSWORD)$/.test(key))) {
        throw new Error(`Unexpected database credentials for ${name}`);
      }
    }
  '
"${compose[@]}" up -d --build gateway catalog-cache
for attempt in {1..60}; do
  if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${GATEWAY_PORT}/api/v1/ready"; then
    curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${GATEWAY_PORT}/api/v1/routing-ready"
    "${compose[@]}" exec -T --index 1 api node < apps/api/test/profile-minio-smoke.cjs
    WASLA_SMOKE_FIXTURE=$("${compose[@]}" exec -T --index 1 -e WASLA_BROWSER_SMOKE=1 api node < apps/api/test/browser-smoke-fixture.cjs)
    WASLA_SMOKE_FIXTURE="$WASLA_SMOKE_FIXTURE" npm --prefix apps/web run test:e2e:compose
    exit 0
  fi
  sleep 2
done
"${compose[@]}" ps
exit 1
