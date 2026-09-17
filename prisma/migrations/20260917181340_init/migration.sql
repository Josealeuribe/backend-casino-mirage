-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombres` VARCHAR(191) NOT NULL,
    `apellidos` VARCHAR(191) NOT NULL,
    `docTipo` VARCHAR(191) NOT NULL,
    `docNumero` VARCHAR(191) NOT NULL,
    `nacimiento` DATETIME(3) NOT NULL,
    `telefono` VARCHAR(191) NOT NULL,
    `ciudad` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `clientes_docNumero_key`(`docNumero`),
    UNIQUE INDEX `clientes_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consentimientos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clienteId` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `aceptado` BOOLEAN NOT NULL,
    `version` VARCHAR(191) NOT NULL DEFAULT 'v1',
    `aceptadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consentimientos_clienteId_idx`(`clienteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visitantes_anonimos` (
    `id` VARCHAR(191) NOT NULL,
    `giros` INTEGER NOT NULL DEFAULT 0,
    `primerGiro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ultimoGiro` DATETIME(3) NOT NULL,
    `ip` VARCHAR(191) NULL,

    INDEX `visitantes_anonimos_ip_idx`(`ip`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `giros_eventos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `giros_eventos_creadoEn_idx`(`creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `intentos_login` (
    `id` VARCHAR(191) NOT NULL,
    `fallos` INTEGER NOT NULL DEFAULT 0,
    `ultimoFallo` DATETIME(3) NOT NULL,
    `bloqueadoHasta` DATETIME(3) NULL,
    `ultimaIp` VARCHAR(191) NULL,

    INDEX `intentos_login_bloqueadoHasta_idx`(`bloqueadoHasta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sedes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clave` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `direccion` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `sedes_clave_key`(`clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `premios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clave` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `detalle` TEXT NOT NULL,
    `monto` INTEGER NOT NULL,
    `weight` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `vigenciaHasta` DATETIME(3) NOT NULL,

    UNIQUE INDEX `premios_clave_key`(`clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cambios_vigencia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `premioId` INTEGER NOT NULL,
    `anterior` DATETIME(3) NOT NULL,
    `nueva` DATETIME(3) NOT NULL,
    `motivo` TEXT NOT NULL,
    `bonosAfectados` INTEGER NOT NULL DEFAULT 0,
    `registradoPor` VARCHAR(191) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cambios_vigencia_premioId_creadoEn_idx`(`premioId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bonos_ganados` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clienteId` INTEGER NOT NULL,
    `premioId` INTEGER NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'pendiente',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `vigenciaHasta` DATETIME(3) NOT NULL,
    `canjeadoEn` DATETIME(3) NULL,
    `canjeadoPorId` INTEGER NULL,
    `sedeCanjeId` INTEGER NULL,

    UNIQUE INDEX `bonos_ganados_clienteId_key`(`clienteId`),
    UNIQUE INDEX `bonos_ganados_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `rol` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `debeCambiarPassword` BOOLEAN NOT NULL DEFAULT false,
    `sedeId` INTEGER NULL,
    `ultimaActividad` DATETIME(3) NULL,
    `sesionCerradaEn` DATETIME(3) NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    INDEX `usuarios_sedeId_idx`(`sedeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `consentimientos` ADD CONSTRAINT `consentimientos_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cambios_vigencia` ADD CONSTRAINT `cambios_vigencia_premioId_fkey` FOREIGN KEY (`premioId`) REFERENCES `premios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bonos_ganados` ADD CONSTRAINT `bonos_ganados_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bonos_ganados` ADD CONSTRAINT `bonos_ganados_premioId_fkey` FOREIGN KEY (`premioId`) REFERENCES `premios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bonos_ganados` ADD CONSTRAINT `bonos_ganados_canjeadoPorId_fkey` FOREIGN KEY (`canjeadoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bonos_ganados` ADD CONSTRAINT `bonos_ganados_sedeCanjeId_fkey` FOREIGN KEY (`sedeCanjeId`) REFERENCES `sedes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_sedeId_fkey` FOREIGN KEY (`sedeId`) REFERENCES `sedes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
