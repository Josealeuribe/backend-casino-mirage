import { randomInt } from "node:crypto";

const ALFABETO = "0123456789ABCDEF";
const LONGITUD = 6;

// Genera un codigo de canje legible tipo "CCM-2026-8A4F2C" para que el
// jugador lo presente en caja.
//
// `randomInt` de node:crypto y no Math.random: un codigo de canje es un
// secreto de portador (quien lo tenga se lleva el premio), asi que no puede
// salir de un generador adivinable. La unicidad real la garantiza la base
// (BonoGanado.codigo es @unique); esto solo hace que una colision sea rara.
export function generarCodigoCanje(): string {
  const year = new Date().getFullYear();
  const random = Array.from({ length: LONGITUD }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  return `CCM-${year}-${random}`;
}
