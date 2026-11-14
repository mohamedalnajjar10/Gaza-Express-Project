-- DropForeignKey
ALTER TABLE `products` DROP FOREIGN KEY `products_store_id_fkey`;

-- DropIndex
DROP INDEX `products_store_id_is_available_idx` ON `products`;

-- CreateIndex
CREATE INDEX `products_store_id_is_available_sort_order_product_id_idx` ON `products`(`store_id`, `is_available`, `sort_order`, `product_id`);

-- CreateIndex
CREATE INDEX `products_store_id_sort_order_product_id_idx` ON `products`(`store_id`, `sort_order`, `product_id`);

-- CreateIndex
CREATE INDEX `reviews_store_id_created_at_review_id_idx` ON `reviews`(`store_id`, `created_at` DESC, `review_id` DESC);

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`store_id`) ON DELETE CASCADE ON UPDATE CASCADE;

