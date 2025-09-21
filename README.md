# SaaS Boilerplate Monorepo

A pnpm-powered monorepo scaffold for a multi-tenant SaaS application. It includes a NestJS backend
with Prisma, a Vite + React frontend, shared TypeScript types, and an infrastructure workspace to
host your Infrastructure as Code.

## Packages

- `@saas-boilerplate/backend` – NestJS API with Prisma, JWT auth (access + refresh tokens), and
  starter auth flows.
- `@saas-boilerplate/frontend` – React + Vite single-page app with sign up, login, and dashboard
  screens.
- `@saas-boilerplate/shared` – Shared TypeScript interfaces for API responses and domain types.
- `@saas-boilerplate/infra` – Placeholder for Terraform/Pulumi/CDK or other deployment tooling.

## Requirements

- [pnpm](https://pnpm.io/) 8.x
- Node.js 18+
- Docker (for local Postgres and Redis)

## Quickstart

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Start local services**

   ```bash
   docker-compose up -d
   ```

3. **Set environment variables** – copy `.env.example` (create one) or define values for:

   ```bash
   export DATABASE_URL="postgresql://saas:saas@localhost:5432/saas"
   export JWT_ACCESS_TOKEN_SECRET="dev-access-secret"
   export JWT_REFRESH_TOKEN_SECRET="dev-refresh-secret"
   export JWT_ACCESS_TOKEN_EXPIRES_IN="15m"
   export JWT_REFRESH_TOKEN_EXPIRES_IN="7d"
   ```

4. **Generate Prisma client and apply migrations**

   ```bash
   pnpm --filter @saas-boilerplate/backend generate
   pnpm --filter @saas-boilerplate/backend migrate:dev
   ```

5. **Run the backend API**

   ```bash
   pnpm --filter @saas-boilerplate/backend dev
   ```

6. **Run the frontend** (in a new terminal)

   ```bash
   pnpm --filter @saas-boilerplate/frontend dev
   ```

Frontend is served on [http://localhost:5173](http://localhost:5173) and proxies API requests to the
NestJS server running at [http://localhost:3000](http://localhost:3000).

## Useful Commands

```bash
pnpm build              # Build every package
pnpm -r test            # Run tests recursively when you add them
pnpm --filter ... lint  # Run linting for a specific package
```

## Docker Services

- **Postgres** – Database for Prisma. Data persisted in the `postgres_data` Docker volume.
- **Redis** – Ready for caching, queues, or rate-limiting.

Stop services at any time with:

```bash
docker-compose down
```

## Next Steps

- Implement emailing for verification and reset flows.
- Add UI state management and authenticated routing on the frontend.
- Automate CI/CD pipelines that run tests, lint, and deploy infrastructure.
