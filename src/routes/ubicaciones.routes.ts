import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";

export const ubicacionesRouter = Router();

// Publica y sin autenticacion: el formulario de registro la necesita ANTES
// de que exista cualquier sesion. El catalogo entero (departamentos +
// municipios) es pequeño -- se trae de una sola vez en vez de pedir los
// municipios por separado cada vez que cambia el departamento elegido.
ubicacionesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const departamentos = await prisma.departamento.findMany({
      where: { activo: true },
      orderBy: { orden: "asc" },
      include: { municipios: { orderBy: { orden: "asc" }, select: { nombre: true } } },
    });

    return res.json({
      departamentos: departamentos.map((d) => ({
        nombre: d.nombre,
        municipios: d.municipios.map((m) => m.nombre),
      })),
    });
  }),
);
