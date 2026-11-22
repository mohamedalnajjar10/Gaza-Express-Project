ALTER TABLE `users` ADD COLUMN `session_version` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `otp_codes`
  ADD COLUMN `challenge` VARCHAR(36) NULL,
  ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;
CREATE INDEX `otp_codes_phone_type_created_at_idx` ON `otp_codes`(`phone`, `type`, `created_at`);
ALTER TABLE `payments` MODIFY `status` ENUM('DUE','PAID','VOID','REFUND_REQUIRED','REFUNDED') NOT NULL DEFAULT 'DUE';
