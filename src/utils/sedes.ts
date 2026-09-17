import { prisma } from "../lib/prisma.js";

// El catalogo de sedes vive en la tabla `sedes`, no en un array del
// frontend: asi el select del cajero y la validacion del canje salen de la
// misma fuente, y se puede abrir o cerrar una sede sin desplegar.

export function listarSedesActivas() {
  return prisma.sede.findMany({
    where: { activo: true },
    orderBy: { orden: "asc" },
    select: { clave: true, nombre: true, direccion: true },
  });
}

export async function idDeSedeActiva(clave: unknown): Promise<number | null> {
  if (typeof clave !== "string" || !clave.trim()) return null;
  const sede = await prisma.sede.findFirst({
    where: { clave: clave.trim(), activo: true },
    select: { id: true },
  });
  return sede?.id ?? null;
}
