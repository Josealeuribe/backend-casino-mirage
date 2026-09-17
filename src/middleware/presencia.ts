import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

// Presencia del personal: lo que hace posible el "Activo / Fuera de linea"
// del modulo de Personal.
//
// La sesion es un JWT sin estado: el servidor no tiene lista de conectados.
// La presencia se deduce de la ultima senal de vida (Usuario.ultimaActividad)
// comparada contra el momento en que cerro sesion por ultima vez.

export const VENTANA_EN_LINEA_SEGUNDOS = 180;
const GUARDAR_CADA_SEGUNDOS = 30;
const ultimaEscritura = new Map<number, number>();

export function estaEnLinea(ultimaActividad: Date | null, sesionCerradaEn: Date | null): boolean {
  if (!ultimaActividad) return false;
  if (Date.now() - ultimaActividad.getTime() >= VENTANA_EN_LINEA_SEGUNDOS * 1000) return false;
  return !sesionCerradaEn || sesionCerradaEn < ultimaActividad;
}

// Debe usarse SIEMPRE despues de requireAuth: lee req.session. No espera a
// la base ni deja que un fallo aqui tumbe la peticion real.
export function registrarPresencia(req: Request, _res: Response, next: NextFunction) {
  const sesion = req.session;
  if (sesion?.tipo !== "staff") return next();

  const id = sesion.usuarioId;
  const ahora = Date.now();
  if (ahora - (ultimaEscritura.get(id) ?? 0) < GUARDAR_CADA_SEGUNDOS * 1000) return next();

  ultimaEscritura.set(id, ahora);

  prisma.usuario
    .update({ where: { id }, data: { ultimaActividad: new Date(ahora) } })
    .catch((error: unknown) => {
      ultimaEscritura.delete(id);
      console.warn(`No se pudo registrar la presencia del usuario ${id}:`, error);
    });

  return next();
}

export async function marcarFueraDeLinea(usuarioId: number): Promise<void> {
  ultimaEscritura.delete(usuarioId);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { sesionCerradaEn: new Date() } });
}
