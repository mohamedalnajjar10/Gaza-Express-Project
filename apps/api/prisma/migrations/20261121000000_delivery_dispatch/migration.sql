CREATE TABLE `delivery_companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(160) NOT NULL,
    `managerId` INTEGER NOT NULL,
    UNIQUE INDEX `delivery_companies_managerId_key` (`managerId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `delivery_companies_managerId_fkey` FOREIGN KEY (`managerId`)
        REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `store_delivery_contracts` (
    `storeId` INTEGER NOT NULL,
    `deliveryCompanyId` INTEGER NOT NULL,
    `confirmed` BOOLEAN NOT NULL DEFAULT false,
    INDEX `store_delivery_contracts_deliveryCompanyId_idx` (`deliveryCompanyId`),
    PRIMARY KEY (`storeId`, `deliveryCompanyId`),
    CONSTRAINT `store_delivery_contracts_storeId_fkey` FOREIGN KEY (`storeId`)
        REFERENCES `stores`(`store_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `store_delivery_contracts_deliveryCompanyId_fkey` FOREIGN KEY (`deliveryCompanyId`)
        REFERENCES `delivery_companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `driver_profiles`
    ADD COLUMN `deliveryCompanyId` INTEGER NULL,
    ADD COLUMN `latitude` DECIMAL(10, 8) NULL,
    ADD COLUMN `longitude` DECIMAL(11, 8) NULL,
    ADD COLUMN `locationUpdatedAt` DATETIME(3) NULL,
    ADD INDEX `driver_profiles_dispatch_idx` (`deliveryCompanyId`, `available`, `approved`, `locationUpdatedAt`),
    ADD CONSTRAINT `driver_profiles_deliveryCompanyId_fkey` FOREIGN KEY (`deliveryCompanyId`)
        REFERENCES `delivery_companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `customer_orders`
    ADD COLUMN `deliveryCompanyId` INTEGER NULL,
    ADD COLUMN `dispatchOpenedAt` DATETIME(3) NULL,
    ADD INDEX `customer_orders_dispatch_idx` (`deliveryCompanyId`, `driverId`, `status`, `dispatchOpenedAt`),
    ADD CONSTRAINT `customer_orders_deliveryCompanyId_fkey` FOREIGN KEY (`deliveryCompanyId`)
        REFERENCES `delivery_companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE `customer_orders` o
LEFT JOIN `payments` p ON p.`orderId` = o.`id`
SET o.`dispatchOpenedAt` = o.`updatedAt`
WHERE o.`driverId` IS NULL AND o.`status` IN ('ACCEPTED', 'READY')
    AND (o.`paymentMethod` = 'CASH' OR p.`status` = 'PAID');
