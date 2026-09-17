import type { Request } from "express";
import { prisma } from "../lib/prisma.js";

// Freno de fuerza bruta sobre el login. Se bloquea por identificador
// (correo/documento) y no por IP: en un casino los equipos de caja y el wifi
// salen por una sola IP, y bloquearla dejaria fuera a todo el personal por
// culpa de un intento ajeno.

const MAX_FALLOS = 5;
const BLOQUEO_MINUTOS = 15;
const VENTANA_MINUTOS = 15;

export interface EstadoBloqueo {
  bloqueado: boolean;
  segundosRestantes: number;
}

function normalizar(identificador: string): string {
  return identificador.trim().toLowerCase().slice(0, 190);
}

function ipDe(req: Request): string | null {
  const reenviada = req.headers["x-forwarded-for"];
  if (typeof reenviada === "string" && reenviada.length > 0) {
    return reenviada.split(",")[0]!.trim().slice(0, 190);
  }
  return req.ip?.slice(0, 190) ?? null;
}

export async function estadoDeBloqueo(identificador: string): Promise<EstadoBloqueo> {
  const registro = await prisma.intentoLogin.findUnique({
    where: { id: normalizar(identificador) },
    select: { bloqueadoHasta: true },
  });

  const hasta = registro?.bloqueadoHasta?.getTime() ?? 0;
  const restante = hasta - Date.now();
  if (restante <= 0) return { bloqueado: false, segundosRestantes: 0 };

  return { bloqueado: true, segundosRestantes: Math.ceil(restante / 1000) };
}

export async function registrarFallo(req: Request, identificador: string): Promise<{ restantes: number }> {
  const id = normalizar(identificador);
  const ahora = new Date();
  const ip = ipDe(req);

  const previo = await prisma.intentoLogin.findUnique({
    where: { id },
    select: { fallos: true, ultimoFallo: true },
  });

  const dentroDeVentana =
    previo != null && ahora.getTime() - previo.ultimoFallo.getTime() < VENTANA_MINUTOS * 60_000;
  const fallos = (dentroDeVentana ? previo!.fallos : 0) + 1;

  const bloqueadoHasta = fallos >= MAX_FALLOS ? new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60_000) : null;

  await prisma.intentoLogin.upsert({
    where: { id },
    update: { fallos, bloqueadoHasta, ultimaIp: ip },
    create: { id, fallos, bloqueadoHasta, ultimaIp: ip },
  });

  if (bloqueadoHasta) {
    console.warn(`Login bloqueado por ${BLOQUEO_MINUTOS} min tras ${fallos} fallos: ${id} (ip ${ip ?? "desconocida"})`);
  }

  return { restantes: Math.max(0, MAX_FALLOS - fallos) };
}

export async function limpiarFallos(identificador: string): Promise<void> {
  await prisma.intentoLogin.deleteMany({ where: { id: normalizar(identificador) } });
}

export const LIMITES_LOGIN = { MAX_FALLOS, BLOQUEO_MINUTOS, VENTANA_MINUTOS };
