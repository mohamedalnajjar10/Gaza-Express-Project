ALTER TABLE product_categories ADD COLUMN parent_id INTEGER NULL;
CREATE INDEX product_categories_parent_id_idx ON product_categories(parent_id);
ALTER TABLE product_categories ADD CONSTRAINT product_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES product_categories(prod_category_id) ON DELETE SET NULL ON UPDATE CASCADE;
