import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

// Evita crear una nueva conexión en cada recarga de Vite en desarrollo.
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

export default prisma;
