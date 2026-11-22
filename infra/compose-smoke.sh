#!/usr/bin/env bash
set -euo pipefail
export COMPOSE_PROJECT_NAME="wasla-ci-${GITHUB_RUN_ID:-$(openssl rand -hex 6)}"
export GATEWAY_PORT=15050
export DOCKER_DB_PASSWORD="$(openssl rand -hex 24)"
export DOCKER_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
export PRODUCT_MEDIA_ACCESS_KEY="$(openssl rand -hex 12)"
export PRODUCT_MEDIA_SECRET_KEY="$(openssl rand -hex 24)"
export MINIO_ROOT_USER="$(openssl rand -hex 12)"
export MINIO_ROOT_PASSWORD="$(openssl rand -hex 24)"
if [[ -f .env ]]; then
  echo 'Refusing to overwrite an existing .env. Run this smoke from a clean CI checkout.'
  exit 1
fi
umask 077
{
  echo 'NODE_ENV=production'
  echo 'SMS_PROVIDER=disabled'
  echo "JWT_SECRET=$(openssl rand -hex 48)"
  echo "JWT_REFRESH_SECRET=$(openssl rand -hex 48)"
  echo "DELIVERY_CODE_SECRET=$(openssl rand -hex 48)"
  echo "PRODUCT_MEDIA_ACCESS_KEY=$PRODUCT_MEDIA_ACCESS_KEY"
  echo "PRODUCT_MEDIA_SECRET_KEY=$PRODUCT_MEDIA_SECRET_KEY"
} > .env
cleanup() { docker compose down -v --remove-orphans; rm -f .env; }
trap cleanup EXIT
COMPOSE_RUNTIME_DATABASE_URL=mysql://api-fixture@mysql/fixture \
COMPOSE_WORKER_DATABASE_URL=mysql://worker-fixture@mysql/fixture \
COMPOSE_MIGRATION_DATABASE_URL=mysql://migrator-fixture@mysql/fixture \
  docker compose --profile sms config --format json | node -e '
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
docker compose up -d --build gateway
for attempt in {1..60}; do
  if curl -fsS -o /dev/null "http://127.0.0.1:${GATEWAY_PORT}/api/v1/ready"; then
    curl -fsS -o /dev/null "http://127.0.0.1:${GATEWAY_PORT}/api/v1/routing-ready"
    docker compose exec -T --index 1 api node < apps/api/test/profile-minio-smoke.cjs
    exit 0
  fi
  sleep 2
done
docker compose ps
exit 1
