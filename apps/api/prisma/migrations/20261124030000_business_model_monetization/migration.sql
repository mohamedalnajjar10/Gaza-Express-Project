-- AlterTable
ALTER TABLE `store_categories`
    ADD COLUMN `default_commission_bps` INTEGER NULL;

-- AlterTable
ALTER TABLE `stores`
    ADD COLUMN `plan_tier` ENUM('FREE', 'PRO') NOT NULL DEFAULT 'FREE',
    ADD COLUMN `commission_bps` INTEGER NULL,
    ADD COLUMN `delivery_base_fee` DECIMAL(8, 2) NULL,
    ADD COLUMN `delivery_per_km_fee` DECIMAL(8, 2) NULL,
    ADD COLUMN `free_delivery_threshold` DECIMAL(8, 2) NULL;

-- AlterTable
ALTER TABLE `delivery_companies`
    ADD COLUMN `feePerOrder` DECIMAL(8, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `customer_orders`
    ADD COLUMN `deliveryDistanceKm` DECIMAL(8, 2) NULL,
    ADD COLUMN `deliveryFee` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `rewardPointsEarned` INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE `payments`
    ADD COLUMN `commissionBpsApplied` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `deliveryFee` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `companyFeeApplied` DECIMAL(14, 2) NOT NULL DEFAULT 0;
