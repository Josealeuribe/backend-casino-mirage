import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { registrarPresencia } from "../middleware/presencia.js";
import { listarSedesActivas } from "../utils/sedes.js";

export const cajeroRouter = Router();

cajeroRouter.use(requireAuth, requireRole("admin", "cajero"), registrarPresencia);

function buscarPorCodigo(codigo: string) {
  return prisma.bonoGanado.findUnique({
    where: { codigo },
    include: {
      premio: { select: { nombre: true, detalle: true, monto: true } },
      cliente: true,
      sedeCanjeada: { select: { nombre: true } },
      canjeadoPor: { select: { nombre: true } },
    },
  });
}

function toCanjePreview(bono: NonNullable<Awaited<ReturnType<typeof buscarPorCodigo>>>) {
  return {
    codigo: bono.codigo,
    estado: bono.estado,
    vigenciaHasta: bono.vigenciaHasta,
    vencido: bono.vigenciaHasta.getTime() < Date.now(),
    premio: { nombre: bono.premio.nombre, detalle: bono.premio.detalle, monto: bono.premio.monto },
    // El cajero coteja estos datos con el documento fisico de la persona que
    // tiene enfrente antes de entregar nada.
    cliente: {
      nombres: bono.cliente.nombres,
      apellidos: bono.cliente.apellidos,
      docTipo: bono.cliente.docTipo,
      docNumero: bono.cliente.docNumero,
      email: bono.cliente.email,
      telefono: bono.cliente.telefono,
      departamento: bono.cliente.departamento,
      ciudad: bono.cliente.ciudad,
      registradoEn: bono.cliente.createdAt,
    },
    sedeCanje: bono.sedeCanjeada?.nombre ?? null,
    canjeadoPor: bono.canjeadoPor?.nombre ?? null,
  };
}

// El frontend arma el select del formulario de canje con esta lista.
cajeroRouter.get(
  "/sedes",
  asyncHandler(async (_req, res) => {
    return res.json({ sedes: await listarSedesActivas() });
  }),
);

// Vigencias de solo lectura: el cajero necesita saber hasta cuando puede
// aceptar cada bono, pero solo el admin puede EXTENDERLAS (ver
// admin.routes.ts POST /premios/:id/vigencia). Por eso este endpoint vive en
// el router de cajero y no expone edicion ni el historial de cambios.
cajeroRouter.get(
  "/vigencias",
  asyncHandler(async (_req, res) => {
    const premios = await prisma.premio.findMany({
      where: { activo: true },
      orderBy: { vigenciaHasta: "asc" },
      select: { clave: true, nombre: true, monto: true, vigenciaHasta: true },
    });
    return res.json({ premios });
  }),
);

// Busqueda por documento: el caso real del mostrador cuando el cliente llega
// sin celular, no recuerda el codigo, o no logra entrar a su cuenta.
cajeroRouter.get(
  "/cliente/:docNumero",
  asyncHandler(async (req, res) => {
    const docNumero = req.params.docNumero.trim();
    if (!docNumero) {
      return res.status(400).json({ error: "Ingresa el número de documento." });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { docNumero },
      include: {
        bono: {
          include: {
            premio: { select: { nombre: true, detalle: true, monto: true } },
            sedeCanjeada: { select: { nombre: true } },
            canjeadoPor: { select: { nombre: true } },
          },
        },
      },
    });

    if (!cliente) {
      return res.status(404).json({ error: "No hay ningún cliente registrado con ese documento." });
    }

    return res.json({
      cliente: {
        nombres: cliente.nombres,
        apellidos: cliente.apellidos,
        docTipo: cliente.docTipo,
        docNumero: cliente.docNumero,
        email: cliente.email,
        telefono: cliente.telefono,
        departamento: cliente.departamento,
        ciudad: cliente.ciudad,
        registradoEn: cliente.createdAt,
      },
      bono: cliente.bono
        ? {
            codigo: cliente.bono.codigo,
            estado: cliente.bono.estado,
            creadoEn: cliente.bono.creadoEn,
            canjeadoEn: cliente.bono.canjeadoEn,
            vigenciaHasta: cliente.bono.vigenciaHasta,
            vencido: cliente.bono.vigenciaHasta.getTime() < Date.now(),
            canjeadoPor: cliente.bono.canjeadoPor?.nombre ?? null,
            sede: cliente.bono.sedeCanjeada?.nombre ?? null,
            premio: { nombre: cliente.bono.premio.nombre, detalle: cliente.bono.premio.detalle, monto: cliente.bono.premio.monto },
          }
        : null,
    });
  }),
);

// Vista previa antes de confirmar el canje.
cajeroRouter.get(
  "/codigo/:codigo",
  asyncHandler(async (req, res) => {
    const bono = await buscarPorCodigo(req.params.codigo.trim().toUpperCase());
    if (!bono) {
      return res.status(404).json({ error: "No existe ningún bono con ese código." });
    }
    return res.json(toCanjePreview(bono));
  }),
);

// Confirma el canje. Unica operacion que cambia el estado del bono a
// 'reclamado'. A diferencia de Casino-cucuta, en Arauca ningun premio esta
// atado a una sede: cualquiera de las dos puede entregar cualquier premio, asi
// que no hace falta validar "sede correcta" antes de canjear.
cajeroRouter.post(
  "/codigo/:codigo/canjear",
  asyncHandler(async (req, res) => {
    const codigo = req.params.codigo.trim().toUpperCase();
    const usuarioId = req.session!.tipo === "staff" ? req.session!.usuarioId : undefined;

    const operador = usuarioId
      ? await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { sedeId: true } })
      : null;

    const existente = await buscarPorCodigo(codigo);
    if (!existente) {
      return res.status(404).json({ error: "No existe ningún bono con ese código." });
    }
    if (existente.estado !== "pendiente") {
      return res.status(409).json({ error: "Este bono ya fue canjeado anteriormente." });
    }
    if (existente.vigenciaHasta.getTime() < Date.now()) {
      const vence = existente.vigenciaHasta.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
      return res.status(410).json({ error: `Este bono venció el ${vence} y ya no puede redimirse.` });
    }

    const resultado = await prisma.bonoGanado.updateMany({
      // El estado va en el WHERE a proposito: si dos cajeros confirman el
      // mismo codigo a la vez, solo uno actualiza una fila y el otro recibe
      // el 409.
      where: { codigo, estado: "pendiente" },
      data: { estado: "reclamado", canjeadoEn: new Date(), canjeadoPorId: usuarioId, sedeCanjeId: operador?.sedeId ?? null },
    });

    if (resultado.count === 0) {
      return res.status(409).json({ error: "Este bono ya fue canjeado anteriormente." });
    }

    const bono = await buscarPorCodigo(codigo);
    return res.json({ ok: true, ...toCanjePreview(bono!) });
  }),
);

// Historial de canjes. Cada cajera ve unicamente los bonos que ella entrego;
// el admin ve todos.
cajeroRouter.get(
  "/historial",
  asyncHandler(async (req, res) => {
    const sesion = req.session!;
    const esAdmin = sesion.tipo === "staff" && sesion.rol === "admin";
    const propios = sesion.tipo === "staff" ? { canjeadoPorId: sesion.usuarioId } : {};

    const canjes = await prisma.bonoGanado.findMany({
      where: { estado: "reclamado", ...(esAdmin ? {} : propios) },
      orderBy: { canjeadoEn: "desc" },
      include: {
        premio: { select: { nombre: true, monto: true } },
        cliente: true,
        sedeCanjeada: { select: { nombre: true } },
        canjeadoPor: { select: { nombre: true } },
      },
    });

    return res.json({
      soloPropios: !esAdmin,
      canjes: canjes.map((bono) => ({
        codigo: bono.codigo,
        canjeadoEn: bono.canjeadoEn,
        canjeadoPor: bono.canjeadoPor?.nombre ?? null,
        sede: bono.sedeCanjeada?.nombre ?? null,
        premio: { nombre: bono.premio.nombre, monto: bono.premio.monto },
        cliente: { nombres: bono.cliente.nombres, apellidos: bono.cliente.apellidos, docNumero: bono.cliente.docNumero },
      })),
    });
  }),
);
