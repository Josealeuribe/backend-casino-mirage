import { PrismaClient } from "@prisma/client";

// Instancia unica de Prisma compartida por toda la app (evita agotar el pool
// de conexiones de MySQL en desarrollo con hot-reload).
export const prisma = new PrismaClient();
