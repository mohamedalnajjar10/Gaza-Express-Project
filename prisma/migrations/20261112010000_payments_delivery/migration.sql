-- AlterTable
ALTER TABLE `customer_orders` ADD COLUMN `activeDriverId` INTEGER NULL,
    ADD COLUMN `deliveryCodeAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `deliveryCodeExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `deliveryNonce` VARCHAR(36) NULL,
    ADD COLUMN `offerExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `offeredDriverId` INTEGER NULL,
    ADD COLUMN `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'ELECTRONIC') NOT NULL DEFAULT 'CASH';

-- CreateTable
CREATE TABLE `driver_profiles` (
    `userId` INTEGER NOT NULL,
    `approved` BOOLEAN NOT NULL DEFAULT false,
    `available` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `orderId` INTEGER NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'ELECTRONIC') NOT NULL,
    `status` ENUM('DUE', 'PAID', 'VOID', 'REFUND_REQUIRED') NOT NULL DEFAULT 'DUE',
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `bankCode` VARCHAR(36) NULL,
    `bankReference` VARCHAR(100) NULL,
    `whatsappMessageId` VARCHAR(191) NULL,
    `whatsappReceivedAt` DATETIME(3) NULL,
    `collectedBy` INTEGER NULL,
    `collectedAt` DATETIME(3) NULL,
    `cashHandedOverAt` DATETIME(3) NULL,
    `cashHandedOverBy` INTEGER NULL,
    `storeShare` DECIMAL(14, 2) NOT NULL,
    `driverShare` DECIMAL(14, 2) NOT NULL,
    `platformShare` DECIMAL(14, 2) NOT NULL,

    UNIQUE INDEX `payments_bankCode_key`(`bankCode`),
    UNIQUE INDEX `payments_bankReference_key`(`bankReference`),
    UNIQUE INDEX `payments_whatsappMessageId_key`(`whatsappMessageId`),
    PRIMARY KEY (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `debit` VARCHAR(80) NOT NULL,
    `credit` VARCHAR(80) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `actorId` INTEGER NOT NULL,
    `reference` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payment_entries_reference_key`(`reference`),
    UNIQUE INDEX `payment_entries_orderId_kind_key`(`orderId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `customer_orders_activeDriverId_key` ON `customer_orders`(`activeDriverId`);

-- AddForeignKey
ALTER TABLE `driver_profiles` ADD CONSTRAINT `driver_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `customer_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_entries` ADD CONSTRAINT `payment_entries_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `payments`(`orderId`) ON DELETE RESTRICT ON UPDATE CASCADE;

