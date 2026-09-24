import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ||
  new PrismaClient({
    log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (config.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
