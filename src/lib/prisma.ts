import { PrismaClient } from '../generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

declare global {
  // Prevent multiple instances of Prisma Client in development
  var prismaInstance: PrismaClient | undefined;
}

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  if (!global.prismaInstance) {
    global.prismaInstance = createPrismaClient();
  }
  prisma = global.prismaInstance;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';

  const adapter = new PrismaLibSql({
    url: databaseUrl,
  });

  return new PrismaClient({ adapter });
}

export { prisma };
