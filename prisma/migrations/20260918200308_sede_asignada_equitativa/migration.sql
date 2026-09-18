/*
  Warnings:

  - Added the required column `sedeAsignadaId` to the `bonos_ganados` table.
    Se agrega como NULL, se rellena con la primera sede activa (por `orden`)
    para las filas que ya existan, y luego se vuelve NOT NULL -- así una base
    con bonos ya creados no se rompe. De aquí en adelante todo bono nuevo
    trae su sede asignada desde el registro (ver utils/asignarSede.ts).

*/
-- AlterTable
ALTER TABLE `bonos_ganados` ADD COLUMN `sedeAsignadaId` INTEGER NULL;

-- Backfill: los bonos que ya existan (de antes de este reparto equitativo)
-- quedan asignados a la primera sede activa, para no dejar la columna vacía.
UPDATE `bonos_ganados`
SET `sedeAsignadaId` = (SELECT `id` FROM `sedes` WHERE `activo` = true ORDER BY `orden` ASC LIMIT 1)
WHERE `sedeAsignadaId` IS NULL;

-- AlterTable
ALTER TABLE `bonos_ganados` MODIFY COLUMN `sedeAsignadaId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `bonos_ganados` ADD CONSTRAINT `bonos_ganados_sedeAsignadaId_fkey` FOREIGN KEY (`sedeAsignadaId`) REFERENCES `sedes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
