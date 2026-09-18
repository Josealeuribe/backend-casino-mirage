import { randomInt } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { estaEnLinea, registrarPresencia, VENTANA_EN_LINEA_SEGUNDOS } from "../middleware/presencia.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"), registrarPresencia);

// --- Vista general ---------------------------------------------------------

adminRouter.get(
  "/vista-general",
  asyncHandler(async (_req, res) => {
    const [clientes, bonoStats, sedes, porPremio, porSede, ultimos, premiosActivos] = await Promise.all([
      prisma.cliente.count(),
      prisma.bonoGanado.groupBy({ by: ["estado"], _count: true }),
      prisma.sede.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
      prisma.bonoGanado.groupBy({ by: ["premioId"], _count: true }),
      // Por SEDE ASIGNADA (reparto equitativo al ganar el bono), no por sede
      // de canje: esto es lo que hay que ver parejo entre las dos sedes
      // desde el momento en que se otorga el bono, se haya redimido o no.
      prisma.bonoGanado.groupBy({ by: ["sedeAsignadaId"], _count: true }),
      prisma.cliente.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { bono: { include: { premio: { select: { nombre: true, monto: true } } } } },
      }),
      prisma.premio.findMany({ where: { activo: true }, orderBy: { vigenciaHasta: "asc" } }),
    ]);

    const pendientes = bonoStats.find((b) => b.estado === "pendiente")?._count ?? 0;
    const canjeados = bonoStats.find((b) => b.estado === "reclamado")?._count ?? 0;
    const conBono = pendientes + canjeados;

    const premios = await prisma.premio.findMany({ select: { id: true, nombre: true, monto: true } });
    const nombrePremio = new Map(premios.map((p) => [p.id, { nombre: p.nombre, monto: p.monto }]));
    const totalRepartoSede = porSede.reduce((sum, s) => sum + s._count, 0);

    const valorTotalCanjeado = await prisma.bonoGanado.findMany({
      where: { estado: "reclamado" },
      select: { premio: { select: { monto: true } } },
    });

    return res.json({
      vigenciaProxima: premiosActivos[0]?.vigenciaHasta ?? null,
      stats: {
        clientesRegistrados: clientes,
        bonosPendientes: pendientes,
        bonosCanjeados: canjeados,
        sinBono: Math.max(0, clientes - conBono),
      },
      valorTotalEntregado: valorTotalCanjeado.reduce((sum, b) => sum + b.premio.monto, 0),
      repartoPorCasino: sedes.map((s) => {
        const count = porSede.find((r) => r.sedeAsignadaId === s.id)?._count ?? 0;
        return { sede: s.nombre, count, pct: totalRepartoSede > 0 ? Math.round((count / totalRepartoSede) * 100) : 0 };
      }),
      bonosPorPremio: porPremio.map((r) => ({
        premio: nombrePremio.get(r.premioId)?.nombre ?? "—",
        monto: nombrePremio.get(r.premioId)?.monto ?? 0,
        count: r._count,
      })),
      ultimosRegistros: ultimos.map((c) => ({
        nombre: `${c.nombres} ${c.apellidos}`,
        fecha: c.createdAt,
        bono: c.bono ? { nombre: c.bono.premio.nombre, monto: c.bono.premio.monto } : null,
      })),
    });
  }),
);

// --- Dashboard (metricas de la semana) -------------------------------------

adminRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hace7Dias = new Date(hoyInicio);
    hace7Dias.setDate(hace7Dias.getDate() - 6);

    const [girosEventos, canjes, sedes, clientesConBono] = await Promise.all([
      prisma.giroEvento.findMany({ where: { creadoEn: { gte: hace7Dias } }, select: { creadoEn: true } }),
      prisma.bonoGanado.findMany({
        where: { estado: "reclamado", canjeadoEn: { gte: hace7Dias } },
        select: { canjeadoEn: true, sedeCanjeId: true, premio: { select: { monto: true } } },
      }),
      prisma.sede.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
      prisma.cliente.count(),
    ]);

    const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const semanal = Array.from({ length: 7 }, (_, i) => {
      const dia = new Date(hace7Dias);
      dia.setDate(dia.getDate() + i);
      const giros = girosEventos.filter((g) => esMismoDia(g.creadoEn, dia)).length;
      const canjesDia = canjes.filter((c) => c.canjeadoEn && esMismoDia(c.canjeadoEn, dia)).length;
      return { dia: DIAS[dia.getDay()], giros, canjes: canjesDia };
    });

    const girosHoy = girosEventos.filter((g) => esMismoDia(g.creadoEn, hoyInicio)).length;
    const canjesHoy = canjes.filter((c) => c.canjeadoEn && esMismoDia(c.canjeadoEn, hoyInicio));
    const totalBonos = await prisma.bonoGanado.count();
    const totalCanjeados = await prisma.bonoGanado.count({ where: { estado: "reclamado" } });

    const porSede = sedes.map((s) => {
      const deLaSede = canjes.filter((c) => c.sedeCanjeId === s.id);
      return {
        sede: s.nombre,
        canjes: deLaSede.length,
        valor: deLaSede.reduce((sum, c) => sum + c.premio.monto, 0),
      };
    });

    return res.json({
      kpisHoy: {
        girosHoy,
        canjesHoy: canjesHoy.length,
        tasaCanje: totalBonos > 0 ? Math.round((totalCanjeados / totalBonos) * 100) : 0,
        valorEntregadoHoy: canjesHoy.reduce((sum, c) => sum + c.premio.monto, 0),
      },
      semanal,
      porSede,
      clientesRegistrados: clientesConBono,
    });
  }),
);

function esMismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// --- Clientes ---------------------------------------------------------------

adminRouter.get(
  "/clientes",
  asyncHandler(async (_req, res) => {
    const clientes = await prisma.cliente.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        bono: {
          include: {
            premio: { select: { nombre: true, monto: true } },
            sedeAsignada: { select: { nombre: true } },
            sedeCanjeada: { select: { nombre: true } },
          },
        },
      },
    });

    return res.json({
      clientes: clientes.map((c) => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        docTipo: c.docTipo,
        docNumero: c.docNumero,
        nacimiento: c.nacimiento,
        telefono: c.telefono,
        departamento: c.departamento,
        ciudad: c.ciudad,
        email: c.email,
        createdAt: c.createdAt,
        bono: c.bono
          ? {
              codigo: c.bono.codigo,
              estado: c.bono.estado,
              creadoEn: c.bono.creadoEn,
              canjeadoEn: c.bono.canjeadoEn,
              sedeAsignada: c.bono.sedeAsignada.nombre,
              sede: c.bono.sedeCanjeada?.nombre ?? null,
              premio: { nombre: c.bono.premio.nombre, monto: c.bono.premio.monto },
            }
          : null,
      })),
    });
  }),
);

// --- Premios / vigencias -----------------------------------------------------
//
// Un mismo catalogo alimenta dos vistas del panel: "Vigencias" (fecha limite
// de cada premio y su historial de cambios) y "Campañas" (que en Arauca, sin
// un motor de campañas por contador como el de Casino-cucuta, se redujo a
// mostrar el rendimiento real de cada premio del catalogo).

adminRouter.get(
  "/premios",
  asyncHandler(async (_req, res) => {
    const premios = await prisma.premio.findMany({
      orderBy: { weight: "desc" },
      include: { _count: { select: { bonos: true } } },
    });
    const canjeadosPorPremio = await prisma.bonoGanado.groupBy({
      by: ["premioId"],
      where: { estado: "reclamado" },
      _count: true,
    });

    return res.json({
      premios: premios.map((p) => ({
        id: p.id,
        clave: p.clave,
        nombre: p.nombre,
        detalle: p.detalle,
        monto: p.monto,
        weight: p.weight,
        activo: p.activo,
        vigenciaHasta: p.vigenciaHasta,
        entregados: p._count.bonos,
        canjeados: canjeadosPorPremio.find((c) => c.premioId === p.id)?._count ?? 0,
      })),
    });
  }),
);

// El formulario manda un <input type="date"> -- una fecha pelada
// "2026-12-31", sin hora. Se exige ese formato exacto (no cualquier string
// parseable) para poder anexarle la hora de fin del dia en Colombia
// nosotros mismos, en vez de dejar que `new Date("2026-12-31")` la
// interprete como medianoche UTC (ver el comentario junto a `nueva` mas
// abajo, donde se arma la fecha real).
const vigenciaSchema = z.object({
  nueva: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  motivo: z.string().trim().min(3, "Indica un motivo."),
});

adminRouter.post(
  "/premios/:id/vigencia",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Premio inválido." });

    const parsed = vigenciaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." });
    }

    const premio = await prisma.premio.findUnique({ where: { id } });
    if (!premio) return res.status(404).json({ error: "Premio no encontrado." });

    // Fin del dia en Colombia (UTC-5, sin horario de verano), no medianoche
    // UTC: `new Date("2026-12-31")` a secas interpretaria esa fecha como
    // 2026-12-31T00:00:00Z, que en Colombia ya es la noche del 30 -- el
    // admin pierde casi un dia entero de vigencia sin darse cuenta.
    const nueva = new Date(`${parsed.data.nueva}T23:59:59-05:00`);
    const sesion = req.session!;
    const registradoPor = sesion.tipo === "staff" ? sesion.email : "desconocido";

    const [, cambio] = await prisma.$transaction([
      prisma.premio.update({ where: { id }, data: { vigenciaHasta: nueva } }),
      prisma.cambioVigencia.create({
        data: { premioId: id, anterior: premio.vigenciaHasta, nueva, motivo: parsed.data.motivo, registradoPor },
      }),
    ]);

    return res.json({ ok: true, cambio });
  }),
);

adminRouter.get(
  "/premios/:id/vigencia-historial",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Premio inválido." });

    const historial = await prisma.cambioVigencia.findMany({
      where: { premioId: id },
      orderBy: { creadoEn: "desc" },
    });
    return res.json({ historial });
  }),
);

// --- Personal -----------------------------------------------------------
//
// POR QUE EL RESET DEL PERSONAL VIVE AQUI Y NO EN EL CORREO: sin proveedor de
// email configurado, un "olvidé mi contraseña" del cajero no tiene a dónde
// llegar. El administrador genera una clave temporal y `debeCambiarPassword`
// obliga a cambiarla al entrar.

adminRouter.get(
  "/usuarios",
  asyncHandler(async (_req, res) => {
    const usuarios = await prisma.usuario.findMany({
      orderBy: [{ rol: "asc" }, { nombre: "asc" }],
      include: { sede: { select: { clave: true, nombre: true } }, _count: { select: { canjes: true } } },
    });

    return res.json({
      usuarios: usuarios.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        activo: u.activo,
        sede: u.sede?.nombre ?? null,
        sedeClave: u.sede?.clave ?? null,
        debeCambiarPassword: u.debeCambiarPassword,
        canjes: u._count.canjes,
        createdAt: u.createdAt,
        ultimaActividad: u.ultimaActividad,
        sesionCerradaEn: u.sesionCerradaEn,
        enLinea: estaEnLinea(u.ultimaActividad, u.sesionCerradaEn),
      })),
      ventanaEnLineaSegundos: VENTANA_EN_LINEA_SEGUNDOS,
    });
  }),
);

const ALFABETO_TEMPORAL = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generarPasswordTemporal(): string {
  const cuerpo = Array.from({ length: 8 }, () => ALFABETO_TEMPORAL[randomInt(0, ALFABETO_TEMPORAL.length)]).join("");
  return `Ccm${cuerpo}${randomInt(0, 10)}`;
}

const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre requerido."),
  email: z.string().trim().toLowerCase().email("Correo inválido."),
  rol: z.enum(["admin", "cajero"]),
  sedeClave: z.string().trim().optional(),
});

adminRouter.post(
  "/usuarios",
  asyncHandler(async (req, res) => {
    const parsed = crearUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." });
    }
    const { nombre, email, rol, sedeClave } = parsed.data;

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });

    let sedeId: number | null = null;
    if (sedeClave) {
      const sede = await prisma.sede.findUnique({ where: { clave: sedeClave } });
      if (!sede) return res.status(400).json({ error: "Sede inválida." });
      sedeId = sede.id;
    }

    const temporal = generarPasswordTemporal();
    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        rol,
        sedeId,
        passwordHash: await bcrypt.hash(temporal, 10),
        debeCambiarPassword: true,
      },
    });

    return res.status(201).json({ ok: true, usuario: { id: usuario.id, nombre, email, rol }, temporal });
  }),
);

const actualizarUsuarioSchema = z.object({ activo: z.boolean() });

adminRouter.patch(
  "/usuarios/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Usuario inválido." });

    const parsed = actualizarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Datos inválidos." });

    const usuario = await prisma.usuario.update({ where: { id }, data: { activo: parsed.data.activo } });
    return res.json({ ok: true, usuario: { id: usuario.id, activo: usuario.activo } });
  }),
);

adminRouter.post(
  "/usuarios/:id/restablecer-password",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Usuario inválido." });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true, nombre: true, email: true } });
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });

    const temporal = generarPasswordTemporal();
    await prisma.usuario.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(temporal, 10), debeCambiarPassword: true },
    });

    console.warn(`Contraseña restablecida: ${usuario.email} por admin ${req.session?.tipo === "staff" ? req.session.email : "desconocido"}`);

    return res.json({ ok: true, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email }, temporal });
  }),
);

// --- Auditoria de canjes ------------------------------------------------

adminRouter.get(
  "/canjes",
  asyncHandler(async (_req, res) => {
    const [canjes, totalClientes] = await Promise.all([
      prisma.bonoGanado.findMany({
        where: { estado: "reclamado" },
        orderBy: { canjeadoEn: "desc" },
        include: {
          premio: { select: { nombre: true, monto: true } },
          cliente: true,
          sedeAsignada: { select: { nombre: true } },
          sedeCanjeada: { select: { nombre: true } },
          canjeadoPor: { select: { nombre: true, email: true } },
        },
      }),
      prisma.cliente.count(),
    ]);

    const valorTotal = canjes.reduce((sum, c) => sum + c.premio.monto, 0);

    return res.json({
      kpis: {
        totalCanjeados: canjes.length,
        valorTotal,
        tasaCanje: totalClientes > 0 ? Math.round((canjes.length / totalClientes) * 100) : 0,
      },
      canjes: canjes.map((bono) => ({
        codigo: bono.codigo,
        creadoEn: bono.creadoEn,
        canjeadoEn: bono.canjeadoEn,
        sedeAsignada: bono.sedeAsignada.nombre,
        sede: bono.sedeCanjeada?.nombre ?? null,
        canjeadoPor: bono.canjeadoPor?.nombre ?? null,
        canjeadoPorEmail: bono.canjeadoPor?.email ?? null,
        premio: { nombre: bono.premio.nombre, monto: bono.premio.monto },
        cliente: {
          nombres: bono.cliente.nombres,
          apellidos: bono.cliente.apellidos,
          docTipo: bono.cliente.docTipo,
          docNumero: bono.cliente.docNumero,
          email: bono.cliente.email,
          telefono: bono.cliente.telefono,
        },
      })),
    });
  }),
);
