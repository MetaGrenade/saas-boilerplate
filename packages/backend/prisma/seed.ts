import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

async function seed() {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Acme Inc';
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? slugify(tenantName))?.trim() || 'seed-tenant';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Acme Admin';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@acme.inc';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const adminRole = process.env.SEED_ADMIN_ROLE ?? 'ADMIN';

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {
      name: tenantName
    },
    create: {
      name: tenantName,
      slug: tenantSlug
    }
  });

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      role: adminRole,
      password: hashedPassword,
      tenantId: tenant.id
    },
    create: {
      name: adminName,
      email: adminEmail,
      role: adminRole,
      password: hashedPassword,
      tenantId: tenant.id
    }
  });

  console.log('Seed complete');
  console.log(`  Tenant: ${tenant.name} (${tenant.slug ?? 'no-slug'})`);
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
