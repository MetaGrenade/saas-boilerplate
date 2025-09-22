import { PrismaClient } from '@prisma/client';
import type { SubscriptionStatus } from '@prisma/client';
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

function addDays(base: Date, days: number) {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfMonth(base: Date) {
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

function monthsAgo(base: Date, months: number) {
  const result = new Date(base);
  result.setMonth(result.getMonth() - months);
  return result;
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

async function upsertUserWithMembership({
  email,
  name,
  passwordHash,
  tenantId,
  roleName,
  isEmailVerified = true,
}: {
  email: string;
  name: string;
  passwordHash: string;
  tenantId: string;
  roleName: RoleName;
  isEmailVerified?: boolean;
}) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: passwordHash,
      isEmailVerified,
    },
    create: {
      name,
      email,
      password: passwordHash,
      isEmailVerified,
    },
  });

  const role = await prisma.role.findUnique({ where: { name: roleName } });

  if (!role) {
    throw new Error(`Required role ${roleName} was not found while seeding users.`);
  }

  const membership = await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId,
      },
    },
    update: {
      roleId: role.id,
    },
    create: {
      userId: user.id,
      tenantId,
      roleId: role.id,
    },
  });

  return { user, membership, role };
}

async function seed() {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Acme Inc';
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? slugify(tenantName))?.trim() || 'seed-tenant';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Acme Admin';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@acme.inc';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  await ensureDefaultRoles();

  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const tenantDomain = extractDomain(adminEmail);
  const tenantIdentifier = tenantSlug.replace(/[^a-z0-9]/g, '') || 'seed';

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {
      name: tenantName,
      domain: tenantDomain,
    },
    create: {
      name: tenantName,
      slug: tenantSlug,
      domain: tenantDomain,
    },
  });

  const { user: adminUser } = await upsertUserWithMembership({
    email: adminEmail,
    name: adminName,
    passwordHash: hashedPassword,
    tenantId: tenant.id,
    roleName: 'OWNER',
  });

  const sampleTeamMembers: Array<{ name: string; email: string; roleName: RoleName }> = [
    {
      name: 'Billie Billing',
      email: `billing@${tenantDomain ?? `${tenantIdentifier}.example.com`}`,
      roleName: 'ADMIN',
    },
    {
      name: 'Casey Collaborator',
      email: `team@${tenantDomain ?? `${tenantIdentifier}.example.com`}`,
      roleName: 'MEMBER',
    },
  ];

  const seededMembers = await Promise.all(
    sampleTeamMembers.map((member) =>
      upsertUserWithMembership({
        email: member.email,
        name: member.name,
        passwordHash: hashedPassword,
        tenantId: tenant.id,
        roleName: member.roleName,
      }),
    ),
  );

  const now = new Date();
  const currentPeriodEnd = addDays(now, 30);
  const currentMonthIssuedAt = startOfMonth(now);
  const previousMonthIssuedAt = monthsAgo(currentMonthIssuedAt, 1);

  const activeStatus: SubscriptionStatus = 'ACTIVE';

  const subscription = await prisma.subscription.upsert({
    where: { stripeSubscriptionId: `sub_${tenantIdentifier}_dev` },
    update: {
      tenantId: tenant.id,
      status: activeStatus,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
    create: {
      tenantId: tenant.id,
      stripeSubscriptionId: `sub_${tenantIdentifier}_dev`,
      status: activeStatus,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  const paymentMethod = await prisma.paymentMethod.upsert({
    where: { stripePaymentMethodId: `pm_${tenantIdentifier}_default` },
    update: {
      tenantId: tenant.id,
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: now.getFullYear() + 2,
      isDefault: true,
    },
    create: {
      tenantId: tenant.id,
      stripePaymentMethodId: `pm_${tenantIdentifier}_default`,
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: now.getFullYear() + 2,
      isDefault: true,
    },
  });

  const invoices = await Promise.all(
    [
      {
        stripeInvoiceId: `in_${tenantIdentifier}_001`,
        status: 'paid',
        amountDue: 7500,
        amountPaid: 7500,
        issuedAt: previousMonthIssuedAt,
        dueAt: addDays(previousMonthIssuedAt, 30),
        paidAt: addDays(previousMonthIssuedAt, 7),
      },
      {
        stripeInvoiceId: `in_${tenantIdentifier}_002`,
        status: 'open',
        amountDue: 7500,
        amountPaid: 0,
        issuedAt: currentMonthIssuedAt,
        dueAt: addDays(currentMonthIssuedAt, 30),
        paidAt: null,
      },
    ].map((invoice) =>
      prisma.invoice.upsert({
        where: { stripeInvoiceId: invoice.stripeInvoiceId },
        update: {
          tenantId: tenant.id,
          status: invoice.status,
          amountDue: invoice.amountDue,
          amountPaid: invoice.amountPaid,
          currency: 'usd',
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          paidAt: invoice.paidAt,
        },
        create: {
          tenantId: tenant.id,
          stripeInvoiceId: invoice.stripeInvoiceId,
          status: invoice.status,
          amountDue: invoice.amountDue,
          amountPaid: invoice.amountPaid,
          currency: 'usd',
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          paidAt: invoice.paidAt,
        },
      }),
    ),
  );

  console.log('Seed complete');
  console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`  Admin user: ${adminUser.email}`);
  console.log(
    `  Team members: ${[adminUser.email, ...seededMembers.map(({ user }) => user.email)].join(', ')}`,
  );
  console.log(`  Subscription: ${subscription.stripeSubscriptionId} (${subscription.status})`);
  console.log(`  Default payment method: ${paymentMethod.stripePaymentMethodId}`);
  console.log(`  Invoices: ${invoices.map((invoice) => invoice.stripeInvoiceId).join(', ')}`);
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
