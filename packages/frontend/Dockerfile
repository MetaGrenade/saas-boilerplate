# syntax=docker/dockerfile:1

# Base image with pnpm and curl for healthchecks
FROM node:20-bookworm-slim

ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH="$PNPM_HOME:$PATH" \
    NODE_ENV=development

RUN corepack enable pnpm \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy manifest files to take advantage of Docker layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json

# Pre-install frontend dependencies for faster container start-up.
RUN pnpm install --frozen-lockfile --prod=false \
    --filter frontend \
    --filter frontend... \
    --filter @saas-boilerplate/shared \
    --filter @saas-boilerplate/shared...

EXPOSE 5173

CMD ["sh", "-c", "cd packages/frontend && pnpm run dev --host 0.0.0.0 --port 5173"]
