-- CreateTable
CREATE TABLE `sms_jobs` (
    `id` CHAR(36) NOT NULL,
    `otpId` INTEGER NOT NULL,
    `payload` TEXT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `leaseUntil` DATETIME(3) NULL,
    `providerId` VARCHAR(80) NULL,
    `errorCode` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sms_jobs_otpId_key`(`otpId`),
    INDEX `sms_jobs_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `sms_jobs_status_expiresAt_idx`(`status`, `expiresAt`),
    INDEX `sms_jobs_status_leaseUntil_idx`(`status`, `leaseUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `eventKey` VARCHAR(100) NOT NULL,
    `kind` VARCHAR(50) NOT NULL,
    `orderId` INTEGER NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_id_idx`(`userId`, `id`),
    UNIQUE INDEX `notifications_userId_eventKey_key`(`userId`, `eventKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

