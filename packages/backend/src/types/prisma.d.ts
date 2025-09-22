declare module '@prisma/client/default' {
  export interface PrismaClientOptions {
    datasources?: Record<string, unknown>;
    log?: unknown;
  }

  export class PrismaClient {
    constructor(options?: PrismaClientOptions);
    [key: string]: any;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $on(eventType: string, callback: (...args: unknown[]) => void): void;
    $transaction<T>(arg: T): Promise<T>;
  }
}

declare module '@prisma/client' {
  export { PrismaClient, PrismaClientOptions } from '@prisma/client/default';
}
