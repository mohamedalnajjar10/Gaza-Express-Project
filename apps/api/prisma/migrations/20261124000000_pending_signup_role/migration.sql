ALTER TABLE `users` ADD COLUMN `pending_signup_role` ENUM('customer', 'store_owner', 'driver', 'admin') NULL;
