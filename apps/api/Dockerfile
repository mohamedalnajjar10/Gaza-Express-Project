FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm PRISMA_SKIP_POSTINSTALL_GENERATE=1 SCARF_ANALYTICS=false npm ci --no-audit --foreground-scripts
COPY . .
RUN DATABASE_URL=mysql://build:build@localhost:3306/build npx prisma generate && npm run build

FROM build AS production-deps
# The generated client declares the CLI as an optional peer, so omit it explicitly.
RUN npm prune --omit=dev --ignore-scripts \
    && rm -rf node_modules/prisma node_modules/@prisma/config node_modules/deepmerge-ts

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package*.json ./
USER node

FROM base AS migrator
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS runtime
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
EXPOSE 5050
CMD ["node", "dist/src/main.js"]
