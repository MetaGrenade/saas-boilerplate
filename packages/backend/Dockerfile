# syntax=docker/dockerfile:1

# Base image with pnpm and curl available for healthchecks
FROM node:20-bookworm-slim

ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH="$PNPM_HOME:$PATH" \
    NODE_ENV=development

RUN corepack enable pnpm \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy only manifest files to leverage Docker layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install the backend and shared dependencies for faster subsequent starts.
RUN pnpm install --frozen-lockfile \
    --filter backend... \
    --filter @saas-boilerplate/shared \
    --filter @saas-boilerplate/shared...

EXPOSE 3000

CMD ["pnpm", "dev:backend"]
