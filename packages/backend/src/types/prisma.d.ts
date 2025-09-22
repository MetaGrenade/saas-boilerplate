declare module '@prisma/client/default' {
  export interface PrismaClientOptions {
    datasources?: Record<string, { url?: string } | undefined>;
    log?: Array<string | Record<string, unknown>>;
  }

  interface CountResult {
    count: number;
  }

  type UnknownArgs = Record<string, unknown>;

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
    tenantId: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface RefreshToken {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
  }

  export interface PasswordResetToken {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    consumed: boolean;
    createdAt: Date;
  }

  export interface Tenant {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  }

  export class PrismaClient {
    constructor(options?: PrismaClientOptions);
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $on(eventType: string, callback: (...args: unknown[]) => void): void;
    $transaction<T>(arg: readonly Promise<unknown>[]): Promise<T[]>;
    $transaction<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T>;

    user: ModelDelegate<User>;
    refreshToken: ModelDelegate<RefreshToken>;
    passwordResetToken: ModelDelegate<PasswordResetToken>;
    tenant: ModelDelegate<Tenant>;
  }
}

declare module '@prisma/client' {
  export { PrismaClient, PrismaClientOptions } from '@prisma/client/default';
}
