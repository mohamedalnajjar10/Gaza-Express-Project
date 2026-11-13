-- CreateTable
CREATE TABLE `delivery_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `address` VARCHAR(500) NOT NULL,
    `latitude` DECIMAL(10, 8) NOT NULL,
    `longitude` DECIMAL(11, 8) NOT NULL,

    INDEX `delivery_addresses_customerId_id_idx`(`customerId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopping_carts` (
    `customerId` INTEGER NOT NULL,
    `storeId` INTEGER NULL,
    `items` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`customerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `storeId` INTEGER NOT NULL,
    `driverId` INTEGER NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `status` ENUM('PENDING', 'QUOTED', 'ACCEPTED', 'READY', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `version` INTEGER NOT NULL DEFAULT 1,
    `addressSnapshot` JSON NOT NULL,
    `itemSnapshots` JSON NOT NULL,
    `storeName` VARCHAR(191) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `estimatedMin` DECIMAL(14, 2) NOT NULL,
    `estimatedMax` DECIMAL(14, 2) NOT NULL,
    `minimumAmount` DECIMAL(14, 2) NOT NULL,
    `proposedTotal` DECIMAL(14, 2) NULL,
    `finalTotal` DECIMAL(14, 2) NULL,
    `requiresQuote` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_orders_customerId_id_idx`(`customerId`, `id`),
    INDEX `customer_orders_storeId_id_idx`(`storeId`, `id`),
    INDEX `customer_orders_driverId_id_idx`(`driverId`, `id`),
    UNIQUE INDEX `customer_orders_customerId_idempotencyKey_key`(`customerId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `actorId` INTEGER NOT NULL,
    `actorRole` ENUM('customer', 'store_owner', 'driver', 'admin') NOT NULL,
    `version` INTEGER NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `fromStatus` ENUM('PENDING', 'QUOTED', 'ACCEPTED', 'READY', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'REJECTED', 'CANCELLED') NULL,
    `toStatus` ENUM('PENDING', 'QUOTED', 'ACCEPTED', 'READY', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'REJECTED', 'CANCELLED') NOT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_events_actorId_idx`(`actorId`),
    UNIQUE INDEX `order_events_orderId_version_key`(`orderId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `delivery_addresses` ADD CONSTRAINT `delivery_addresses_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopping_carts` ADD CONSTRAINT `shopping_carts_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_orders` ADD CONSTRAINT `customer_orders_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_orders` ADD CONSTRAINT `customer_orders_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_orders` ADD CONSTRAINT `customer_orders_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`store_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `customer_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

