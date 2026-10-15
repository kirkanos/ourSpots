-- CreateTable
CREATE TABLE `VideoJob` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `startedById` CHAR(36) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'wartend',
    `rezept` LONGTEXT NOT NULL,
    `bilder` INTEGER NOT NULL DEFAULT 0,
    `bilderGesamt` INTEGER NOT NULL DEFAULT 0,
    `bytes` INTEGER NOT NULL DEFAULT 0,
    `dauerS` DOUBLE NOT NULL DEFAULT 0,
    `fehler` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VideoJob_tripId_key`(`tripId`),
    INDEX `VideoJob_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VideoJob` ADD CONSTRAINT `VideoJob_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoJob` ADD CONSTRAINT `VideoJob_startedById_fkey` FOREIGN KEY (`startedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
