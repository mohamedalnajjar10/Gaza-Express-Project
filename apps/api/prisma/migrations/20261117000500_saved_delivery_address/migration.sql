ALTER TABLE users ADD COLUMN address_prompted_at DATETIME(3) NULL, ADD COLUMN default_address_id INTEGER NULL;
ALTER TABLE delivery_addresses
  ADD COLUMN area VARCHAR(120) NULL,
  ADD COLUMN residence_type VARCHAR(20) NOT NULL DEFAULT 'HOUSE',
  ADD COLUMN building VARCHAR(160) NULL,
  ADD COLUMN floor VARCHAR(40) NULL,
  ADD COLUMN street VARCHAR(160) NULL,
  ADD COLUMN phone VARCHAR(20) NULL,
  ADD COLUMN directions VARCHAR(300) NULL;
UPDATE users u JOIN (SELECT customerId, MAX(id) id FROM delivery_addresses GROUP BY customerId) a ON a.customerId = u.user_id
SET u.default_address_id = a.id, u.address_prompted_at = CURRENT_TIMESTAMP(3);
CREATE INDEX users_default_address_id_idx ON users(default_address_id);
ALTER TABLE users ADD CONSTRAINT users_default_address_id_fkey FOREIGN KEY (default_address_id) REFERENCES delivery_addresses(id) ON DELETE SET NULL ON UPDATE CASCADE;
