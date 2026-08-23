# ---------------------------------------------------------------------------
# Multi-stage Dockerfile — the standard production pattern.
# Stage 1 installs dependencies; stage 2 copies only what is needed to run.
# Result: a small image with no build tools or dev dependencies inside.
# ---------------------------------------------------------------------------

# ---- Stage 1: install dependencies ----------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
# Copy ONLY the manifest first so Docker can cache the npm install layer.
# Code changes then reuse this cached layer instead of reinstalling everything.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ---- Stage 2: runtime image ------------------------------------------------
FROM node:20-alpine
WORKDIR /app

# Run as a non-root user — a container security best practice.
RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

ENV PORT=3000 NODE_ENV=production
EXPOSE 3000

# Docker itself can restart the container if this check fails;
# in Kubernetes the probes in deployment.yaml play this role instead.
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "src/server.js"]
