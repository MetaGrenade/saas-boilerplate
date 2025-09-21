# SaaS Boilerplate Monorepo

A pnpm-powered monorepo scaffold that bundles everything you need to bootstrap a modern multi-tenant SaaS product:

- **Backend** – NestJS + Prisma + PostgreSQL with JWT authentication, refresh tokens, and password reset flows.
- **Frontend** – React + Vite + TypeScript with ready-to-use authentication screens and a dashboard.
- **Shared** – TypeScript types shared across client and server.
- **Infra** – A placeholder workspace prepared for Infrastructure-as-Code experiments.

## Quick start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Provision local services

A `docker-compose.yml` file is provided for PostgreSQL and Redis. Spin them up in a separate terminal:

```bash
docker compose up -d
```

### 3. Configure environment variables

Copy the backend environment template and adjust values as needed:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Update `DATABASE_URL`, JWT secrets, and expiration windows if required.

### 4. Prepare the database

Generate the Prisma client and run migrations (creates the schema based on `prisma/schema.prisma`):

```bash
pnpm prisma:generate
pnpm --filter backend prisma:migrate
```

### 5. Run the apps

Start the backend API and the frontend SPA concurrently:

```bash
pnpm dev
```

- Backend API: http://localhost:3000
- Frontend SPA: http://localhost:5173

Alternatively, run them individually with `pnpm dev:backend` or `pnpm dev:frontend`.

## Project layout

```
packages/
  backend/   NestJS application with Prisma ORM and Auth module
  frontend/  React + Vite single-page app with authentication screens
  shared/    Shared TypeScript contracts for API responses and models
  infra/     Infrastructure-as-Code playground (CDK for Terraform installed)
```

## Helpful scripts

- `pnpm build` – Build every workspace.
- `pnpm lint` – Lint source files in every workspace.
- `pnpm format` – Format source files using Prettier.
- `pnpm prisma:generate` – Generate the Prisma client for the backend workspace.

## Authentication flow summary

1. **Register** – `POST /auth/register` creates a tenant and user, returning access + refresh tokens.
2. **Login** – `POST /auth/login` issues tokens for existing users.
3. **Refresh** – `POST /auth/refresh` exchanges a valid refresh token for a new pair of tokens.
4. **Verify** – `POST /auth/verify` validates an access token and returns its payload.
5. **Reset password** –
   - `POST /auth/reset/request` generates a reset token.
   - `POST /auth/reset/confirm` confirms the reset and updates the password.

These endpoints power the pre-built frontend authentication pages.

## Next steps

- Integrate email delivery for verification and password reset flows.
- Extend the data model with billing, invitations, and role-based permissions.
- Connect the infra workspace to provision cloud resources automatically.
