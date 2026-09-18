import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEPARTAMENTOS } from "./ubicaciones.js";

const prisma = new PrismaClient();

// Las 2 sedes reales de Arauca -- mismos datos que
// frontend/src/shared/data/sedes.ts, la unica fuente de verdad visual. Si esa
// lista cambia, esta debe cambiar con ella.
const SEDES = [
  { clave: "mirage-3", nombre: "Centro Club Mirage 3", direccion: "Cra. 22 #21-07", orden: 0 },
  { clave: "mirage-2", nombre: "Centro Club Mirage No. 2", direccion: "Cra. 22 #20-49", orden: 1 },
];

// Los 3 bonos de la promocion -- mismos datos y pesos que
// frontend/src/features/landing/data/prizes.ts. `clave` enlaza cada fila con
// el icono/color que sigue viviendo en el frontend.
//
// Fecha limite real de la promocion: 30 de septiembre de 2026 (fin del dia,
// hora Colombia = UTC-5 todo el año, sin horario de verano). Fija a
// proposito, no "hoy + 1 año" -- un bono creado hoy y otro creado la semana
// que viene deben vencer el mismo dia, no ir corriendo la fecha cada vez que
// se siembra la base.
const vigenciaHasta = new Date("2026-09-30T23:59:59-05:00");

// Reparto pedido explicitamente: el bono de $50.000 le toca a 1 de cada 10
// personas (10%); el otro 90% se reparte por igual entre $10.000 y $20.000
// (45% cada uno). weightedRandomIndex normaliza por la suma de los pesos, asi
// que lo que importa es la PROPORCION entre ellos, no que sumen 100 -- se
// eligio 100 solo porque hace el porcentaje de cada uno obvio a simple vista.
const PREMIOS = [
  {
    clave: "bono-10000",
    nombre: "Bono de $10.000",
    detalle: "Redimible únicamente en nuestras sedes físicas de Arauca, presentando tu documento en caja.",
    monto: 10000,
    weight: 45,
  },
  {
    clave: "bono-20000",
    nombre: "Bono de $20.000",
    detalle: "Redimible únicamente en nuestras sedes físicas de Arauca, presentando tu documento en caja.",
    monto: 20000,
    weight: 45,
  },
  {
    clave: "bono-50000",
    nombre: "Bono de $50.000",
    detalle: "Nuestro bono de bienvenida mayor, redimible únicamente en nuestras sedes físicas de Arauca.",
    monto: 50000,
    weight: 10,
  },
];

async function main() {
  let totalMunicipios = 0;
  for (let i = 0; i < DEPARTAMENTOS.length; i++) {
    const { nombre, municipios } = DEPARTAMENTOS[i];
    const departamento = await prisma.departamento.upsert({
      where: { nombre },
      update: { orden: i },
      create: { nombre, orden: i },
    });
    for (let j = 0; j < municipios.length; j++) {
      await prisma.municipio.upsert({
        where: { departamentoId_nombre: { departamentoId: departamento.id, nombre: municipios[j] } },
        update: { orden: j },
        create: { nombre: municipios[j], departamentoId: departamento.id, orden: j },
      });
    }
    // Sincroniza de verdad: borra los municipios que hayan quedado de una
    // version anterior de este archivo y ya no esten en la lista actual.
    // Sin esto, un upsert solo agrega/actualiza -- nunca limpia lo que
    // sobra, y un municipio movido de departamento (o corregido) se quedaria
    // duplicado para siempre en el de antes.
    await prisma.municipio.deleteMany({
      where: { departamentoId: departamento.id, nombre: { notIn: municipios } },
    });
    totalMunicipios += municipios.length;
  }
  console.log(`Departamentos sembrados: ${DEPARTAMENTOS.length} (${totalMunicipios} municipios)`);

  for (const sede of SEDES) {
    await prisma.sede.upsert({ where: { clave: sede.clave }, update: sede, create: sede });
  }
  console.log(`Sedes sembradas: ${SEDES.length}`);

  for (const premio of PREMIOS) {
    await prisma.premio.upsert({
      where: { clave: premio.clave },
      // vigenciaHasta va tambien en el update (no solo en el create): sin
      // esto, volver a correr el seed despues de cambiar la fecha limite
      // aqui arriba no la aplicaria a los premios que ya existen en base.
      update: { nombre: premio.nombre, detalle: premio.detalle, monto: premio.monto, weight: premio.weight, vigenciaHasta },
      create: { ...premio, vigenciaHasta },
    });
  }
  console.log(`Premios sembrados: ${PREMIOS.length}`);

  // Cuenta de administrador inicial, solo si no existe ninguna todavia. La
  // clave temporal se imprime UNA vez en este log; cambia en el primer
  // ingreso (debeCambiarPassword).
  const yaHayAdmin = await prisma.usuario.findFirst({ where: { rol: "admin" } });
  if (!yaHayAdmin) {
    const temporal = "Mirage2026!";
    await prisma.usuario.create({
      data: {
        nombre: "Administrador",
        email: "admin@centroclubmirage.co",
        rol: "admin",
        passwordHash: await bcrypt.hash(temporal, 10),
        debeCambiarPassword: true,
      },
    });
    console.log(`Admin inicial creado: admin@centroclubmirage.co / ${temporal} (cámbiala al entrar)`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
