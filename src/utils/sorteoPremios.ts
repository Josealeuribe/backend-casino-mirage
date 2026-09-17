import type { Premio } from "@prisma/client";
import { weightedRandomIndex } from "./weightedRandom.js";

// El sorteo real de un giro. El sorteo que se ve en el frontend (a que
// casilla apunta la ruleta 3D) es puramente visual.
//
// A diferencia de Casino-cucuta, en Arauca ningun premio esta atado a una
// sede especifica (ambas sedes redimen cualquier premio), asi que no hace
// falta equilibrar el reparto por sede: es un sorteo ponderado simple sobre
// el catalogo activo.
export function elegirPremio(candidatos: Premio[]): Premio {
  return candidatos[weightedRandomIndex(candidatos.map((p) => p.weight))];
}

export function sortearPremio(premiosActivos: Premio[]): Premio {
  if (premiosActivos.length === 0) throw new Error("No hay premios activos que sortear.");
  return elegirPremio(premiosActivos);
}
