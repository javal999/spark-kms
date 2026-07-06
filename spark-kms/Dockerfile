# syntax=docker/dockerfile:1
# Production image for SPARK KMS (Next.js standalone). Debian glibc base so the
# native @node-rs/argon2 binding loads. Build for linux/amd64 for App Runner:
#   docker buildx build --platform linux/amd64 -t <ecr-uri>:latest --push .

# 1) Install all deps (incl. dev) for the build.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) Build the standalone server.
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) Minimal runtime.
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs
# Standalone server + static assets + public files.
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
# DATABASE_URL and SESSION_SECRET are injected by App Runner (from Secrets Manager).
# Force HOSTNAME=0.0.0.0 at start: App Runner/ECS inject their own HOSTNAME, which
# would make Next's standalone server bind to a single interface the health check
# can't reach. The inline assignment overrides the inherited value.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
