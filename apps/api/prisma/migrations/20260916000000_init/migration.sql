-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `oidcSub` VARCHAR(255) NOT NULL,
    `email` VARCHAR(320) NULL,
    `displayName` VARCHAR(200) NOT NULL,
    `avatarUrl` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_oidcSub_key`(`oidcSub`),
    INDEX `User_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `userAgent` VARCHAR(500) NULL,
    `ip` VARCHAR(45) NULL,
    `idToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vehicle` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `heightM` DOUBLE NULL,
    `widthM` DOUBLE NULL,
    `lengthM` DOUBLE NULL,
    `weightT` DOUBLE NULL,
    `axles` INTEGER NULL,
    `consumptionL100km` DOUBLE NULL,

    INDEX `Vehicle_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Trip` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `startDate` DATE NULL,
    `endDate` DATE NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'planned',
    `vehicleId` CHAR(36) NULL,
    `coverPhotoId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Trip_ownerId_idx`(`ownerId`),
    INDEX `Trip_startDate_idx`(`startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripMember` (
    `tripId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TripMember_userId_idx`(`userId`),
    PRIMARY KEY (`tripId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Stage` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `seq` INTEGER NOT NULL,
    `title` VARCHAR(200) NULL,
    `date` DATE NULL,
    `notes` TEXT NULL,

    INDEX `Stage_tripId_seq_idx`(`tripId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Waypoint` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `stageId` CHAR(36) NULL,
    `seq` INTEGER NOT NULL,
    `kind` VARCHAR(10) NOT NULL DEFAULT 'via',
    `name` VARCHAR(200) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lon` DOUBLE NOT NULL,
    `address` VARCHAR(500) NULL,
    `plannedArrival` DATE NULL,
    `plannedNights` INTEGER NULL,
    `locked` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Waypoint_tripId_seq_idx`(`tripId`, `seq`),
    INDEX `Waypoint_stageId_seq_idx`(`stageId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Route` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `stageId` CHAR(36) NULL,
    `profileHash` CHAR(64) NOT NULL,
    `distanceM` DOUBLE NOT NULL,
    `durationS` DOUBLE NOT NULL,
    `geometry` LONGTEXT NOT NULL,
    `bbox` VARCHAR(120) NULL,
    `provider` VARCHAR(40) NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Route_profileHash_key`(`profileHash`),
    INDEX `Route_tripId_idx`(`tripId`),
    INDEX `Route_stageId_idx`(`stageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Spot` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NULL,
    `createdById` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lon` DOUBLE NOT NULL,
    `address` VARCHAR(500) NULL,
    `country` CHAR(2) NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'stellplatz',
    `visitedAt` DATE NULL,
    `nights` INTEGER NULL,
    `rating` INTEGER NULL,
    `pricePerNight` DECIMAL(10, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'EUR',
    `notes` TEXT NULL,
    `isPrivateNote` BOOLEAN NOT NULL DEFAULT false,
    `source` VARCHAR(10) NOT NULL DEFAULT 'manual',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Spot_tripId_idx`(`tripId`),
    INDEX `Spot_createdById_idx`(`createdById`),
    INDEX `Spot_lat_lon_idx`(`lat`, `lon`),
    INDEX `Spot_visitedAt_idx`(`visitedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SpotAmenity` (
    `spotId` CHAR(36) NOT NULL,
    `amenity` VARCHAR(40) NOT NULL,

    INDEX `SpotAmenity_amenity_idx`(`amenity`),
    PRIMARY KEY (`spotId`, `amenity`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Photo` (
    `id` CHAR(36) NOT NULL,
    `spotId` CHAR(36) NULL,
    `diaryEntryId` CHAR(36) NULL,
    `uploadedById` CHAR(36) NOT NULL,
    `storageKey` VARCHAR(400) NOT NULL,
    `mimeType` VARCHAR(60) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `bytes` INTEGER NOT NULL,
    `takenAt` DATETIME(3) NULL,
    `lat` DOUBLE NULL,
    `lon` DOUBLE NULL,
    `caption` VARCHAR(500) NULL,
    `sortIndex` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Photo_spotId_sortIndex_idx`(`spotId`, `sortIndex`),
    INDEX `Photo_diaryEntryId_sortIndex_idx`(`diaryEntryId`, `sortIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiaryEntry` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `title` VARCHAR(200) NULL,
    `text` TEXT NULL,
    `odometerKm` INTEGER NULL,
    `weather` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DiaryEntry_tripId_date_idx`(`tripId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelLog` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `lat` DOUBLE NULL,
    `lon` DOUBLE NULL,
    `liters` DECIMAL(8, 2) NOT NULL,
    `pricePerL` DECIMAL(6, 3) NULL,
    `totalCost` DECIMAL(10, 2) NULL,
    `odometerKm` INTEGER NULL,
    `isFull` BOOLEAN NOT NULL DEFAULT true,

    INDEX `FuelLog_tripId_date_idx`(`tripId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'EUR',
    `note` VARCHAR(500) NULL,

    INDEX `Expense_tripId_date_idx`(`tripId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShareLink` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `createdById` CHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `includePhotos` BOOLEAN NOT NULL DEFAULT true,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ShareLink_token_key`(`token`),
    INDEX `ShareLink_tripId_idx`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeocodeCache` (
    `key` VARCHAR(255) NOT NULL,
    `response` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GeocodeCache_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripMember` ADD CONSTRAINT `TripMember_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripMember` ADD CONSTRAINT `TripMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stage` ADD CONSTRAINT `Stage_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Waypoint` ADD CONSTRAINT `Waypoint_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Waypoint` ADD CONSTRAINT `Waypoint_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `Stage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Route` ADD CONSTRAINT `Route_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Route` ADD CONSTRAINT `Route_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `Stage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Spot` ADD CONSTRAINT `Spot_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Spot` ADD CONSTRAINT `Spot_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SpotAmenity` ADD CONSTRAINT `SpotAmenity_spotId_fkey` FOREIGN KEY (`spotId`) REFERENCES `Spot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Photo` ADD CONSTRAINT `Photo_spotId_fkey` FOREIGN KEY (`spotId`) REFERENCES `Spot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Photo` ADD CONSTRAINT `Photo_diaryEntryId_fkey` FOREIGN KEY (`diaryEntryId`) REFERENCES `DiaryEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Photo` ADD CONSTRAINT `Photo_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiaryEntry` ADD CONSTRAINT `DiaryEntry_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelLog` ADD CONSTRAINT `FuelLog_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareLink` ADD CONSTRAINT `ShareLink_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareLink` ADD CONSTRAINT `ShareLink_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

