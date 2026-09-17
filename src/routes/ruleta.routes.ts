import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { sortearPremio } from "../utils/sorteoPremios.js";
import { signPrizeTicket, verifySessionToken } from "../utils/jwt.js";
import { asegurarIdentidad, girosUsadosPor, registrarGiro } from "../utils/visitante.js";

export const ruletaRouter = Router();

// Giros que puede hacer un mismo visitante. Recargar la pagina no sirve para
// volver a tirar: el conteo lo lleva el servidor contra la identidad del
// visitante (ver utils/visitante.ts).
export const GIROS_MAXIMOS = 3;

// Vigencia publica: la fecha limite para redimir un bono, la misma que
// promete la promocion. Es de solo lectura y no revela nada sensible, asi
// que no necesita autenticacion -- la vista de "Gira y Gana" la muestra
// antes de que exista cualquier sesion.
ruletaRouter.get(
  "/vigencia",
  asyncHandler(async (_req, res) => {
    const premio = await prisma.premio.findFirst({
      where: { activo: true },
      orderBy: { vigenciaHasta: "asc" },
      select: { vigenciaHasta: true },
    });
    return res.json({ vigenciaHasta: premio?.vigenciaHasta ?? null });
  }),
);

ruletaRouter.get(
  "/giros-restantes",
  asyncHandler(async (req, res) => {
    const usados = await girosUsadosPor(req);
    const identidad = asegurarIdentidad(req, res);
    return res.json({
      usados,
      maximo: GIROS_MAXIMOS,
      restantes: Math.max(0, GIROS_MAXIMOS - usados),
      visitanteToken: identidad.token,
    });
  }),
);

// Giro anonimo: cualquier visitante puede girar sin haberse registrado. El
// servidor hace el sorteo ponderado real (el frontend ya no decide el
// premio, solo la animacion visual de la ruleta 3D) y devuelve un ticket
// firmado que el registro usara para asignar el bono a la cuenta que se cree.
ruletaRouter.post(
  "/girar-anonimo",
  asyncHandler(async (req, res) => {
    // La promocion es de captacion: gira unicamente quien no tiene sesion
    // abierta. Se rechaza a CUALQUIER sesion valida -- clientes porque ya
    // estan registrados, y personal porque no participa en la promocion.
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) {
      try {
        const sesion = verifySessionToken(token);
        const mensaje =
          sesion.tipo === "cliente"
            ? "La ruleta es solo para quienes aún no tienen cuenta. Consulta tus beneficios desde tu perfil."
            : "El personal de Centro Club Mirage no participa en la promoción.";
        return res.status(409).json({ error: mensaje });
      } catch {
        // Token vencido o corrupto: se trata como visitante anonimo.
      }
    }

    const yaUsados = await girosUsadosPor(req);
    if (yaUsados >= GIROS_MAXIMOS) {
      return res.status(429).json({
        error: `Ya usaste tus ${GIROS_MAXIMOS} giros de la promoción. Regístrate para reclamar el premio que obtuviste.`,
        usados: yaUsados,
        maximo: GIROS_MAXIMOS,
        restantes: 0,
      });
    }

    const premios = await prisma.premio.findMany({ where: { activo: true } });
    if (premios.length === 0) {
      return res.status(503).json({ error: "No hay premios disponibles en este momento." });
    }

    // El giro se cuenta aqui, cuando ya se sabe que hay premios que sortear:
    // asi un 503 no le consume un intento a nadie.
    const { girosUsados, token: visitanteToken } = await registrarGiro(req, res);
    // Registro de solo-fecha para las graficas de "giros por dia" del admin.
    // No lleva relacion con nada: si falla, no debe tumbar el giro real.
    prisma.giroEvento.create({ data: {} }).catch((error: unknown) => {
      console.warn("No se pudo registrar el evento de giro:", error);
    });

    const premio = sortearPremio(premios);
    const ticket = signPrizeTicket({ premioClave: premio.clave });

    return res.json({
      premio: {
        clave: premio.clave,
        nombre: premio.nombre,
        detalle: premio.detalle,
        monto: premio.monto,
      },
      ticket,
      usados: girosUsados,
      maximo: GIROS_MAXIMOS,
      restantes: Math.max(0, GIROS_MAXIMOS - girosUsados),
      visitanteToken,
    });
  }),
);
