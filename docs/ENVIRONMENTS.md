# Environments

- Development uses `.env` and the local `wasla` database. The application account is `wasla_app` (read/write only). Prisma CLI uses `MIGRATION_DATABASE_URL` with the separate `wasla_migrator` account.
- Integration tests use `.env.test` locally or environment variables in CI. The dedicated MySQL account can access only `wasla_test`. Tests use MySQL and JWT directly, with test doubles for SMS and Redis.
- Production loads `.env.production` when `NODE_ENV=production`, or accepts injected variables. Use `.env.production.example` as a template. Provision separate runtime and migration accounts on the production server and use independent signing keys and Redis. Production credentials and an actual deployment are supplied separately.
- `ENV_FILE` selects an explicit environment file for Nest and Prisma CLI. Set it to the production file when running production migrations. Local Compose injects its own service URLs and uses a disposable local database volume.

Run verification from the project root:

```powershell
npm run build
npm run lint
npm test -- --runInBand
$env:ENV_FILE = '.env.test'
npx prisma migrate deploy
Remove-Item Env:ENV_FILE
npm run test:e2e -- --runInBand
```

Never put credentials in the tracked templates. For another workstation, create a `wasla_test` schema and account scoped to it, then copy `.env.test.example` to `.env.test` and supply its URL and two independent signing secrets.
