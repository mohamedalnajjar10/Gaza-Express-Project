-- CreateTable
CREATE TABLE `store_moderation_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `actorId` INTEGER NOT NULL,
    `fromStatus` ENUM('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'CLOSED_TEMPORARILY', 'INACTIVE') NOT NULL,
    `toStatus` ENUM('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'CLOSED_TEMPORARILY', 'INACTIVE') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `store_moderation_events_storeId_id_idx`(`storeId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_moderation_events` ADD CONSTRAINT `store_moderation_events_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`store_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_moderation_events` ADD CONSTRAINT `store_moderation_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

