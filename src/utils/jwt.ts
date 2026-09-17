import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const TICKET_SECRET = process.env.TICKET_SECRET;
if (!JWT_SECRET) throw new Error("Falta JWT_SECRET en el entorno.");
if (!TICKET_SECRET) throw new Error("Falta TICKET_SECRET en el entorno.");

// Secretos derivados por HMAC de un unico JWT_SECRET, en vez de variables de
// entorno separadas para cada uso: un secreto menos que rotar y que se puede
// filtrar.
function derivar(uso: string): string {
  return createHmac("sha256", JWT_SECRET!).update(uso).digest("hex");
}

const VISITANTE_SECRET = derivar("visitante-anonimo");

export type SessionPayload =
  | { tipo: "cliente"; clienteId: number; email: string }
  | { tipo: "staff"; usuarioId: number; email: string; rol: "admin" | "cajero" };

const SESSION_TOKEN_TTL = process.env.SESSION_TOKEN_TTL || "7d";

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: SESSION_TOKEN_TTL } as jwt.SignOptions);
}

export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, JWT_SECRET!) as SessionPayload;
}

export interface TicketPayload {
  premioClave: string;
}

const TICKET_TTL_MINUTES = Number(process.env.TICKET_TTL_MINUTES || 30);

// El "ticket" de premio: firma el resultado del giro anonimo para que el
// formulario de registro pueda reclamarlo sin que el cliente (o cualquiera
// con las devtools abiertas) pueda inventarse un premio mejor.
export function signPrizeTicket(payload: TicketPayload): string {
  return jwt.sign(payload, TICKET_SECRET!, { expiresIn: `${TICKET_TTL_MINUTES}m` });
}

export function verifyPrizeTicket(token: string): TicketPayload {
  return jwt.verify(token, TICKET_SECRET!) as TicketPayload;
}

export interface VisitantePayload {
  vid: string;
}

const UN_ANIO = "365d";

export function signVisitanteToken(payload: VisitantePayload): string {
  return jwt.sign(payload, VISITANTE_SECRET, { expiresIn: UN_ANIO });
}

export function verifyVisitanteToken(token: string): VisitantePayload {
  return jwt.verify(token, VISITANTE_SECRET) as VisitantePayload;
}
