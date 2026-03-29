# ─────────────────────────────────────────────────────────────────────────────
# MediCore API — Production Dockerfile
# Build context MUST be the monorepo root (base_directory = / in Coolify)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# System dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install tsx globally so it's always accessible
RUN npm install -g tsx@4.19.2

# Skip browser binary downloads (Puppeteer/Playwright not needed for SRI)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ── Install workspace dependencies ────────────────────────────────────────────
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/config/   ./packages/config/
COPY packages/shared/   ./packages/shared/
COPY packages/database/ ./packages/database/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --filter @medicore/api...

# ── Copy source ───────────────────────────────────────────────────────────────
COPY apps/api/src/       ./apps/api/src/
COPY apps/api/tsconfig.json ./apps/api/

# ── Runtime ───────────────────────────────────────────────────────────────────
WORKDIR /app/apps/api

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["tsx", "src/index.ts"]
