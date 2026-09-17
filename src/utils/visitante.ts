import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { signVisitanteToken, verifyVisitanteToken } from "./jwt.js";

// Identificacion del visitante anonimo para poder limitar los giros.
//
// La cookie sola no basta: si front y API quedan en origenes distintos (p.ej.
// bajo subpaths distintos de innovaclub.com.co, o el front en un dominio y la
// API en otro), la cookie viaja como cookie de tercero y Safari/Chrome en
// movil la bloquean. Junto a la cookie, el servidor devuelve el mismo id en
// un token firmado que el frontend guarda en localStorage y reenvia en la
// cabecera `X-Visitante`. El servidor acepta cualquiera de las dos.
//
// Esto resiste recargar, cerrar y reabrir el navegador. No resiste modo
// incognito ni borrar los datos del sitio a mano. El candado duro esta mas
// adelante: un cliente solo puede tener UN bono en toda su vida
// (BonoGanado.clienteId es @unique).

export const COOKIE_VISITANTE = "ccm_visitante";
export const CABECERA_VISITANTE = "x-visitante";

const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

export function leerIdVisitante(req: Request): string | null {
  const deCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_VISITANTE];
  if (typeof deCookie === "string" && deCookie.length > 0) return deCookie;

  const token = req.headers[CABECERA_VISITANTE];
  if (typeof token === "string" && token.length > 0) {
    try {
      return verifyVisitanteToken(token).vid;
    } catch {
      // Token vencido, manipulado o de otro despliegue: se trata como
      // visitante nuevo.
    }
  }

  return null;
}

export function emitirCookieVisitante(res: Response, id: string) {
  const enProduccion = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_VISITANTE, id, {
    httpOnly: true,
    maxAge: UN_ANIO_MS,
    sameSite: enProduccion ? "none" : "lax",
    secure: enProduccion,
    path: "/",
  });
}

function ipDe(req: Request): string | null {
  const reenviada = req.headers["x-forwarded-for"];
  if (typeof reenviada === "string" && reenviada.length > 0) {
    return reenviada.split(",")[0]!.trim().slice(0, 190);
  }
  return req.ip?.slice(0, 190) ?? null;
}

export interface IdentidadVisitante {
  id: string;
  token: string;
}

export function asegurarIdentidad(req: Request, res: Response): IdentidadVisitante {
  const id = leerIdVisitante(req) ?? randomUUID();
  emitirCookieVisitante(res, id);
  return { id, token: signVisitanteToken({ vid: id }) };
}

export interface RegistroDeGiro extends IdentidadVisitante {
  girosUsados: number;
}

export async function registrarGiro(req: Request, res: Response): Promise<RegistroDeGiro> {
  const identidad = asegurarIdentidad(req, res);
  const ip = ipDe(req);

  const visitante = await prisma.visitanteAnonimo.upsert({
    where: { id: identidad.id },
    update: { giros: { increment: 1 }, ip },
    create: { id: identidad.id, giros: 1, ip },
  });

  return { ...identidad, girosUsados: visitante.giros };
}

export async function girosUsadosPor(req: Request): Promise<number> {
  const id = leerIdVisitante(req);
  if (!id) return 0;
  const visitante = await prisma.visitanteAnonimo.findUnique({
    where: { id },
    select: { giros: true },
  });
  return visitante?.giros ?? 0;
}
