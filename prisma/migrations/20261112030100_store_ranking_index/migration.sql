CREATE INDEX `stores_status_avg_rating_store_id_idx` ON `stores`(`status`, `avg_rating` DESC, `store_id`);
