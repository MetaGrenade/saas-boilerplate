declare module '@prisma/client/default' {
  export interface PrismaClientOptions {
    datasources?: Record<string, { url?: string } | undefined>;
    log?: Array<string | Record<string, unknown>>;
  }

  interface CountResult {
    count: number;
  }

  type UnknownArgs = Record<string, unknown>;

  export type RoleName = 'OWNER' | 'ADMIN' | 'MEMBER';
  export type Permission =
    | 'MANAGE_USERS'
    | 'MANAGE_BILLING'
    | 'VIEW_BILLING'
    | 'MANAGE_SUBSCRIPTION';
  export type SubscriptionStatus =
    | 'INCOMPLETE'
    | 'INCOMPLETE_EXPIRED'
    | 'TRIALING'
    | 'ACTIVE'
    | 'PAST_DUE'
    | 'CANCELED'
    | 'UNPAID'
    | 'PAUSED';

  interface ModelDelegate<T> {
    findUnique(args: UnknownArgs): Promise<T | null>;
    findMany(args?: UnknownArgs): Promise<T[]>;
    create(args: UnknownArgs): Promise<T>;
    update(args: UnknownArgs): Promise<T>;
    updateMany(args: UnknownArgs): Promise<CountResult>;
    upsert(args: UnknownArgs): Promise<T>;
    delete(args: UnknownArgs): Promise<T>;
    deleteMany(args: UnknownArgs): Promise<CountResult>;
  }

  export interface User {
    id: string;
    email: string;
    password: string;
    name: string | null;
    isEmailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    memberships?: Membership[];
    refreshTokens?: RefreshToken[];
    passwordResetTokens?: PasswordResetToken[];
  }

  export interface Tenant {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    createdAt: Date;
    updatedAt: Date;
    memberships?: Membership[];
    subscriptions?: Subscription[];
    paymentMethods?: PaymentMethod[];
    invoices?: Invoice[];
  }

  export interface Membership {
    id: string;
    userId: string;
    tenantId: string;
    roleId: string;
    createdAt: Date;
    user?: User;
    tenant?: Tenant;
    role?: Role;
  }

  export interface Role {
    id: string;
    name: RoleName;
    description: string | null;
    permissions: Permission[];
    createdAt: Date;
    updatedAt: Date;
    memberships?: Membership[];
  }

  export interface RefreshToken {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revoked: boolean;
    createdAt: Date;
    user?: User;
  }

  export interface PasswordResetToken {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    consumed: boolean;
    createdAt: Date;
    user?: User;
  }

  export interface Subscription {
    id: string;
    tenantId: string;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    createdAt: Date;
    updatedAt: Date;
    tenant?: Tenant;
  }

  export interface PaymentMethod {
    id: string;
    tenantId: string;
    stripePaymentMethodId: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
    createdAt: Date;
    tenant?: Tenant;
  }

  export interface Invoice {
    id: string;
    tenantId: string;
    stripeInvoiceId: string;
    status: string;
    amountDue: number;
    amountPaid: number;
    currency: string;
    issuedAt: Date;
    dueAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
    tenant?: Tenant;
  }

  export class PrismaClient {
    constructor(options?: PrismaClientOptions);
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $on(eventType: string, callback: (...args: unknown[]) => void): void;
    $transaction<T>(arg: readonly Promise<unknown>[]): Promise<T[]>;
    $transaction<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T>;

    user: ModelDelegate<User>;
    tenant: ModelDelegate<Tenant>;
    membership: ModelDelegate<Membership>;
    role: ModelDelegate<Role>;
    refreshToken: ModelDelegate<RefreshToken>;
    passwordResetToken: ModelDelegate<PasswordResetToken>;
    subscription: ModelDelegate<Subscription>;
    paymentMethod: ModelDelegate<PaymentMethod>;
    invoice: ModelDelegate<Invoice>;
  }
}

declare module '@prisma/client' {
  export { PrismaClient, PrismaClientOptions } from '@prisma/client/default';
}
