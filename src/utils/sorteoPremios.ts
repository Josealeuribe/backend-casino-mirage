import type { Premio } from "@prisma/client";
import { weightedRandomIndex } from "./weightedRandom.js";

// El sorteo real de un giro. El sorteo que se ve en el frontend (a que
// casilla apunta la ruleta 3D) es puramente visual.
//
// Este sorteo decide unicamente EL VALOR del premio (10k/20k/50k) -- ninguno
// de los tres esta atado a una sede en particular, asi que el peso de cada
// uno no necesita ajustarse por sede: es un sorteo ponderado simple sobre el
// catalogo activo.
//
// La sede donde ese premio debe reclamarse es una decision APARTE, tomada
// despues y por otro motivo: el reparto equitativo de carga entre las dos
// sedes fisicas (ver utils/asignarSede.ts, usado en auth.routes.ts al crear
// el BonoGanado). Un mismo premio puede terminar asignado a cualquiera de
// las dos sedes segun cual le toque en ese reparto.
export function elegirPremio(candidatos: Premio[]): Premio {
  return candidatos[weightedRandomIndex(candidatos.map((p) => p.weight))];
}

export function sortearPremio(premiosActivos: Premio[]): Premio {
  if (premiosActivos.length === 0) throw new Error("No hay premios activos que sortear.");
  return elegirPremio(premiosActivos);
}
