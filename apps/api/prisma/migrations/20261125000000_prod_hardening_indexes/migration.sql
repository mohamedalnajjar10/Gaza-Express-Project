-- CreateIndex
CREATE INDEX `stores_status_avg_rating_idx` ON `stores`(`status`, `avg_rating`);

-- CreateIndex
CREATE INDEX `stores_status_estimated_prep_min_idx` ON `stores`(`status`, `estimated_prep_min`);

-- CreateIndex
CREATE INDEX `stores_status_created_at_idx` ON `stores`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `stores_status_category_id_area_id_idx` ON `stores`(`status`, `category_id`, `area_id`);

-- CreateIndex
CREATE INDEX `customer_orders_offeredDriverId_offerExpiresAt_idx` ON `customer_orders`(`offeredDriverId`, `offerExpiresAt`);
