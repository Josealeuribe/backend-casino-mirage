/*
  Warnings:

  - Added the required column `departamento` to the `clientes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `clientes` ADD COLUMN `departamento` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `departamentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `departamentos_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `municipios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `departamentoId` INTEGER NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,

    INDEX `municipios_departamentoId_idx`(`departamentoId`),
    UNIQUE INDEX `municipios_departamentoId_nombre_key`(`departamentoId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `municipios` ADD CONSTRAINT `municipios_departamentoId_fkey` FOREIGN KEY (`departamentoId`) REFERENCES `departamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
