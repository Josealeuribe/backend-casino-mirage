import type { Prisma } from "@prisma/client";

// Reparto EQUITATIVO de sedes: cada bono que se gana se asigna, en el
// momento de crearse, a la sede que hasta ahora tiene MENOS bonos asignados
// -- no es una alternancia fija por conteo total (que se desincroniza si
// algo falla a mitad de camino), es un balance que se autocorrige solo
// mirando el estado real de la base en cada asignacion. Con 2 sedes esto da
// como mucho una de diferencia entre ellas en todo momento; si mañana hay 3
// o más sedes activas, el mismo criterio las reparte por igual entre todas.
//
// DEBE llamarse con el mismo `tx` (cliente de transaccion) que crea el
// BonoGanado -- ver auth.routes.ts -- para que el conteo y la creacion
// queden en la misma transaccion.
export async function elegirSedeEquitativa(tx: Prisma.TransactionClient): Promise<number> {
  const sedes = await tx.sede.findMany({
    where: { activo: true },
    select: { id: true },
    orderBy: { orden: "asc" },
  });
  if (sedes.length === 0) {
    throw new Error("No hay sedes activas para asignar el bono.");
  }

  const conteos = await tx.bonoGanado.groupBy({ by: ["sedeAsignadaId"], _count: true });
  const conteoPorSede = new Map(conteos.map((c) => [c.sedeAsignadaId, c._count]));

  let minConteo = Infinity;
  let candidatas: number[] = [];
  for (const sede of sedes) {
    const n = conteoPorSede.get(sede.id) ?? 0;
    if (n < minConteo) {
      minConteo = n;
      candidatas = [sede.id];
    } else if (n === minConteo) {
      candidatas.push(sede.id);
    }
  }

  // Empate (el caso mas comun con 2 sedes, cada vez que quedan parejas): se
  // rompe al azar para no favorecer siempre a la misma sede en cada empate.
  return candidatas[Math.floor(Math.random() * candidatas.length)];
}
