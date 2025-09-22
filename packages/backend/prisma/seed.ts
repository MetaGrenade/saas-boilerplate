import { PrismaClient } from '@prisma/client';
import type { Permission, RoleName } from '@saas-boilerplate/shared';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ROLE_DEFINITIONS: Record<RoleName, { description: string; permissions: Permission[] }> = {
  OWNER: {
    description: 'Tenant owner with unrestricted access to manage billing and users.',
    permissions: ['MANAGE_USERS', 'MANAGE_BILLING', 'VIEW_BILLING', 'MANAGE_SUBSCRIPTION'],
  },
  ADMIN: {
    description: 'Administrator who can manage users and billing settings.',
    permissions: ['MANAGE_USERS', 'MANAGE_BILLING', 'VIEW_BILLING', 'MANAGE_SUBSCRIPTION'],
  },
  MEMBER: {
    description: 'Standard member with read-only access to billing information.',
    permissions: ['VIEW_BILLING'],
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function extractDomain(email: string | undefined): string | null {
  if (!email) {
    return null;
  }

  const [, domain] = email.split('@');
  return domain ? domain.toLowerCase() : null;
}

async function ensureDefaultRoles() {
  await Promise.all(
    (Object.entries(ROLE_DEFINITIONS) as Array<[RoleName, { description: string; permissions: Permission[] }]>)
      .map(([name, definition]) =>
        prisma.role.upsert({
          where: { name },
          update: {
            description: definition.description,
            permissions: definition.permissions,
          },
          create: {
            id: `role-${name.toLowerCase()}`,
            name,
            description: definition.description,
            permissions: definition.permissions,
          },
        }),
      ),
  );
}

async function seed() {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Acme Inc';
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? slugify(tenantName))?.trim() || 'seed-tenant';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Acme Admin';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@acme.inc';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  await ensureDefaultRoles();

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {
      name: tenantName,
      domain: extractDomain(adminEmail),
    },
    create: {
      name: tenantName,
      slug: tenantSlug,
      domain: extractDomain(adminEmail),
    },
  });

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      password: hashedPassword,
      isEmailVerified: true,
    },
    create: {
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      isEmailVerified: true,
    },
  });

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'OWNER' } });

  await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
    update: {
      roleId: ownerRole.id,
    },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      roleId: ownerRole.id,
    },
  });

  console.log('Seed complete');
  console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`  Admin user: ${user.email}`);
}

seed()
  .catch((error) => {
    console.error('Seed failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
