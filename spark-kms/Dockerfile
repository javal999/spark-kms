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
# Headroom for `next build` (react-force-graph/recharts push heap up).
ENV NODE_OPTIONS=--max-old-space-size=4096
# Phase 7 feature flags. NEXT_PUBLIC_* are inlined into the client bundle at
# build time, so they must be present here (not just at runtime). Default 0
# (off); the deploy passes --build-arg to turn a feature on. The runtime
# deployment env must set the SAME values for the server-side reads.
ARG NEXT_PUBLIC_FEATURE_GRAPH=0
ARG NEXT_PUBLIC_FEATURE_TRACKING=0
ARG NEXT_PUBLIC_FEATURE_SSO=0
ENV NEXT_PUBLIC_FEATURE_GRAPH=$NEXT_PUBLIC_FEATURE_GRAPH
ENV NEXT_PUBLIC_FEATURE_TRACKING=$NEXT_PUBLIC_FEATURE_TRACKING
ENV NEXT_PUBLIC_FEATURE_SSO=$NEXT_PUBLIC_FEATURE_SSO
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) Minimal runtime.
FROM node:20-bookworm-slim AS runner
WORKDIR /app
# Cap the V8 heap BELOW the container's RAM (Lightsail power `small` = 1 GB,
# see LIGHTSAIL-DEPLOY.md). Without this, Node sizes the heap from the cgroup
# limit and a runaway request grows until the KERNEL SIGKILLs the container —
# which produces no log line and no `error_events` row, so an admin sees an
# upload "fail" with nothing to trace (D31). With an explicit cap, V8 aborts
# first and prints "JavaScript heap out of memory" to the container log.
# KEEP IN SYNC with the container power: ~75% of RAM.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=768 \
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
