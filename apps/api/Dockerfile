# ─────────────────────────────────────────────────────────────────────────────
# MediCore API — Production Dockerfile
# Build context MUST be the monorepo root (base_directory = /)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Skip browser binary downloads (Puppeteer/Playwright not needed for core SRI)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ── Copy workspace manifests (for dependency installation) ────────────────────
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/config/ ./packages/config/
COPY packages/shared/  ./packages/shared/
COPY packages/database/ ./packages/database/
COPY apps/api/package.json ./apps/api/

# Install ALL workspace deps (including devDeps for tsx)
RUN pnpm install --frozen-lockfile --filter @medicore/api...

# ── Copy source code ───────────────────────────────────────────────────────────
COPY apps/api/src/      ./apps/api/src/
COPY apps/api/tsconfig.json ./apps/api/

WORKDIR /app/apps/api

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

# Run directly with tsx — handles TypeScript + workspace package imports natively
CMD ["node_modules/.bin/tsx", "src/index.ts"]
