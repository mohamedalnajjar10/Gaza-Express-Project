ALTER TABLE products ADD COLUMN sold_quantity BIGINT NOT NULL DEFAULT 0;
CREATE INDEX products_store_availability_sales_idx ON products(store_id, is_available, sold_quantity DESC, product_id);
