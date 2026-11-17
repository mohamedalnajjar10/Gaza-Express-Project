ALTER TABLE `customer_orders`
  ADD COLUMN `rewardPointsUsed` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `rewardDiscountRate` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `rewardDiscount` DECIMAL(14, 2) NOT NULL DEFAULT 0;
CREATE INDEX `customer_orders_customerId_status_idx` ON `customer_orders`(`customerId`, `status`);
